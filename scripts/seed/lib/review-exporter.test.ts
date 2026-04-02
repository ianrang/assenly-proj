// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs mock ────────────────────────────────────────────────

const { mockWriteFileSync, mockReadFileSync, mockExistsSync, mockMkdirSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

// ── csv-parser mock ────────────────────────────────────────

const { mockStringifyCsvRows, mockParseCsvFile } = vi.hoisted(() => ({
  mockStringifyCsvRows: vi.fn().mockReturnValue("csv-content"),
  mockParseCsvFile: vi.fn().mockReturnValue([]),
}));

vi.mock("./csv-parser", () => ({
  stringifyCsvRows: mockStringifyCsvRows,
  parseCsvFile: mockParseCsvFile,
}));

// ── imports ────────────────────────────────────────────────

import { exportForReview, importReviewed } from "./review-exporter";
import type { EnrichedRecord } from "./types";

// ── 헬퍼 ──────────────────────────────────────────────────

function makeEnriched(
  entityType: string,
  data: Record<string, unknown> = {},
  enrichments?: Partial<EnrichedRecord["enrichments"]>,
): EnrichedRecord {
  return {
    source: "csv",
    sourceId: `test-${entityType}-1`,
    entityType: entityType as EnrichedRecord["entityType"],
    data: {
      id: `uuid-${entityType}-1`,
      name: { ko: "테스트", en: "Test" },
      ...data,
    },
    enrichments: {
      translatedFields: ["name"],
      classifiedFields: [],
      confidence: {},
      ...enrichments,
    },
    enrichedAt: new Date().toISOString(),
  };
}

const FIXED_TIMESTAMP = "2026-03-31T00-00-00-000Z";

// ── exportForReview ────────────────────────────────────────

describe("exportForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("product export: JSON + CSV 파일 생성", () => {
    const records = [makeEnriched("product", {
      skin_types: ["dry", "normal"],
      concerns: ["dryness"],
      description: { ko: "제품 설명", en: "Product desc" },
      review_summary: { ko: "리뷰 요약", en: "Review summary" },
    }, {
      classifiedFields: ["skin_types", "concerns"],
      confidence: { skin_types: 0.85, concerns: 0.78 },
    })];

    const result = exportForReview(records, {
      outputDir: "/tmp/review",
      timestamp: FIXED_TIMESTAMP,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].entityType).toBe("product");
    expect(result.files[0].count).toBe(1);
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);

    // JSON 파일 작성 확인
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("enriched-product-"),
      expect.stringContaining("uuid-product-1"),
    );

    // CSV stringifyCsvRows 호출 확인
    expect(mockStringifyCsvRows).toHaveBeenCalledTimes(1);
    const [csvRows, csvColumns] = mockStringifyCsvRows.mock.calls[0];
    expect(csvRows).toHaveLength(1);
    expect(csvColumns).toContain("id");
    expect(csvColumns).toContain("skin_types");
    expect(csvColumns).toContain("skin_types_confidence");
    expect(csvColumns).toContain("concerns");
    expect(csvColumns).toContain("is_approved");

    // 행 내용 검증
    expect(csvRows[0].id).toBe("uuid-product-1");
    expect(csvRows[0].skin_types).toBe("dry|normal");
    expect(csvRows[0].skin_types_confidence).toBe("0.85");
    expect(csvRows[0].concerns).toBe("dryness");
    expect(csvRows[0].concerns_confidence).toBe("0.78");
    expect(csvRows[0].description_ko).toBe("제품 설명");
    expect(csvRows[0].description_en).toBe("Product desc");
    expect(csvRows[0].is_approved).toBe("");
    expect(csvRows[0].review_notes).toBe("");
  });

  it("다중 엔티티: product + ingredient → 별도 파일 쌍", () => {
    const records = [
      makeEnriched("product", { skin_types: ["dry"] }, { confidence: { skin_types: 0.9 } }),
      makeEnriched("ingredient", { caution_skin_types: ["sensitive"] }, { confidence: { caution_skin_types: 0.7 } }),
    ];

    const result = exportForReview(records, {
      outputDir: "/tmp/review",
      timestamp: FIXED_TIMESTAMP,
    });

    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.entityType).sort()).toEqual(["ingredient", "product"]);
    expect(result.total).toBe(2);

    // stringifyCsvRows 2회 호출 (각 엔티티별)
    expect(mockStringifyCsvRows).toHaveBeenCalledTimes(2);
  });

  it("brand: 공통 컬럼만 CSV (분류 없음)", () => {
    const records = [makeEnriched("brand")];

    exportForReview(records, {
      outputDir: "/tmp/review",
      timestamp: FIXED_TIMESTAMP,
    });

    const [, csvColumns] = mockStringifyCsvRows.mock.calls[0];
    // 공통(4) + 검수메타(2) = 6 컬럼
    expect(csvColumns).toHaveLength(6);
    expect(csvColumns).toContain("id");
    expect(csvColumns).toContain("name_ko");
    expect(csvColumns).toContain("is_approved");
    expect(csvColumns).not.toContain("skin_types");
  });

  it("빈 레코드 → 파일 미생성", () => {
    const result = exportForReview([], { outputDir: "/tmp/review" });

    expect(result.files).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(mockStringifyCsvRows).not.toHaveBeenCalled();
  });

  it("array 직렬화: skin_types → 파이프 구분", () => {
    const records = [makeEnriched("product", {
      skin_types: ["dry", "oily", "combination"],
      concerns: [],
    })];

    exportForReview(records, { outputDir: "/tmp/review", timestamp: FIXED_TIMESTAMP });

    const [csvRows] = mockStringifyCsvRows.mock.calls[0];
    expect(csvRows[0].skin_types).toBe("dry|oily|combination");
    expect(csvRows[0].concerns).toBe("");
  });

  it("LocalizedText 평탄화: name.ko → name_ko 컬럼", () => {
    const records = [makeEnriched("store", {
      description: { ko: "매장 설명", en: "Store desc" },
    })];

    exportForReview(records, { outputDir: "/tmp/review", timestamp: FIXED_TIMESTAMP });

    const [csvRows] = mockStringifyCsvRows.mock.calls[0];
    expect(csvRows[0].name_ko).toBe("테스트");
    expect(csvRows[0].name_en).toBe("Test");
    expect(csvRows[0].description_ko).toBe("매장 설명");
    expect(csvRows[0].description_en).toBe("Store desc");
  });

  it("store: 8개 검수 컬럼 전체 출력", () => {
    const records = [makeEnriched("store", {
      store_type: "olive_young",
      district: "gangnam",
      address: { ko: "서울 강남구 강남대로 396" },
      phone: "02-1234-5678",
      english_support: "basic",
      tourist_services: ["tax_refund", "multilingual_staff"],
      description: { ko: "K-뷰티 매장", en: "K-beauty store" },
    })];

    exportForReview(records, { outputDir: "/tmp/review", timestamp: FIXED_TIMESTAMP });

    const [csvRows, csvColumns] = mockStringifyCsvRows.mock.calls[0];

    // 공통(4) + store 전용(8) + 검수메타(2) = 14 컬럼
    expect(csvColumns).toHaveLength(14);
    expect(csvColumns).toContain("store_type");
    expect(csvColumns).toContain("district");
    expect(csvColumns).toContain("address_ko");
    expect(csvColumns).toContain("phone");
    expect(csvColumns).toContain("english_support");
    expect(csvColumns).toContain("tourist_services");
    expect(csvColumns).toContain("description_ko");
    expect(csvColumns).toContain("description_en");

    // 행 값 검증
    expect(csvRows[0].store_type).toBe("olive_young");
    expect(csvRows[0].district).toBe("gangnam");
    expect(csvRows[0].address_ko).toBe("서울 강남구 강남대로 396");
    expect(csvRows[0].phone).toBe("02-1234-5678");
    expect(csvRows[0].english_support).toBe("basic");
    expect(csvRows[0].tourist_services).toBe("tax_refund|multilingual_staff");
    expect(csvRows[0].description_ko).toBe("K-뷰티 매장");
    expect(csvRows[0].description_en).toBe("K-beauty store");
  });

  it("confidence 포함: enrichments.confidence 값 CSV에 반영", () => {
    const records = [makeEnriched("treatment", {
      suitable_skin_types: ["dry"],
      target_concerns: ["wrinkles"],
    }, {
      confidence: { suitable_skin_types: 0.92, target_concerns: 0.88 },
    })];

    exportForReview(records, { outputDir: "/tmp/review", timestamp: FIXED_TIMESTAMP });

    const [csvRows] = mockStringifyCsvRows.mock.calls[0];
    expect(csvRows[0].suitable_skin_types_confidence).toBe("0.92");
    expect(csvRows[0].target_concerns_confidence).toBe("0.88");
  });

  it("entityTypes 필터: product만 → 나머지 스킵", () => {
    const records = [
      makeEnriched("product"),
      makeEnriched("brand"),
      makeEnriched("ingredient"),
    ];

    const result = exportForReview(records, {
      outputDir: "/tmp/review",
      entityTypes: ["product"],
      timestamp: FIXED_TIMESTAMP,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].entityType).toBe("product");
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("출력 디렉토리 미존재 시 mkdirSync 호출", () => {
    mockExistsSync.mockReturnValue(false);

    exportForReview([makeEnriched("brand")], {
      outputDir: "/tmp/new-dir",
      timestamp: FIXED_TIMESTAMP,
    });

    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/new-dir", { recursive: true });
  });
});

// ── importReviewed ─────────────────────────────────────────

describe("importReviewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("기본 import: JSON + CSV → ValidatedRecord[]", () => {
    const enriched = [makeEnriched("product", {
      skin_types: ["dry"],
      concerns: ["dryness"],
      description: { ko: "원본", en: "Original" },
      price: 25000,
    })];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-product-1",
      skin_types: "dry",
      concerns: "dryness",
      description_ko: "원본",
      description_en: "Original",
      is_approved: "TRUE",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records).toHaveLength(1);
    expect(result.matched).toBe(1);
    expect(result.errors).toHaveLength(0);

    const record = result.records[0];
    expect(record.entityType).toBe("product");
    expect(record.isApproved).toBe(true);
    expect(record.reviewedBy).toBe("google-sheets");
    expect(record.data.price).toBe(25000); // 원본 보존
    expect(record.data.id).toBe("uuid-product-1");
    expect(record.reviewNotes).toBeUndefined(); // 빈 문자열 → undefined
  });

  it("skin_types 수정: 파이프 구분 파싱 + 오버라이드", () => {
    const enriched = [makeEnriched("product", {
      skin_types: ["dry"],
      concerns: [],
    })];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-product-1",
      skin_types: "dry|combination|sensitive",
      concerns: "acne|dryness",
      is_approved: "true",
      review_notes: "피부 타입 추가",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");
    const data = result.records[0].data as Record<string, unknown>;

    expect(data.skin_types).toEqual(["dry", "combination", "sensitive"]);
    expect(data.concerns).toEqual(["acne", "dryness"]);
    expect(result.records[0].reviewNotes).toBe("피부 타입 추가");
  });

  it("description 수정: ko/en 텍스트 오버라이드 + 다른 언어 보존", () => {
    const enriched = [makeEnriched("store", {
      description: { ko: "원본 설명", en: "Original desc", ja: "元の説明" },
    })];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-store-1",
      description_ko: "수정된 설명",
      description_en: "Modified desc",
      is_approved: "TRUE",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");
    const desc = result.records[0].data.description as Record<string, string>;

    expect(desc.ko).toBe("수정된 설명");
    expect(desc.en).toBe("Modified desc");
    expect(desc.ja).toBe("元の説明"); // JSON 원본 보존
  });

  it("is_approved FALSE → isApproved=false", () => {
    const enriched = [makeEnriched("brand")];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-brand-1",
      is_approved: "FALSE",
      review_notes: "품질 미달",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records[0].isApproved).toBe(false);
    expect(result.records[0].reviewNotes).toBe("품질 미달");
  });

  it("미검수 레코드: JSON에만 있고 CSV에 없음 → 제외", () => {
    const enriched = [
      makeEnriched("brand", {}, undefined),
      { ...makeEnriched("brand"), sourceId: "test-brand-2", data: { id: "uuid-brand-2", name: { ko: "B", en: "B" } } },
    ];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-brand-1",
      is_approved: "true",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records).toHaveLength(1);
    expect(result.matched).toBe(1);
    expect(result.skipped).toBe(1); // uuid-brand-2 not in CSV
  });

  it("빈 array: '' → []", () => {
    const enriched = [makeEnriched("ingredient", {
      caution_skin_types: ["sensitive"],
    })];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-ingredient-1",
      caution_skin_types: "",
      is_approved: "true",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");
    const data = result.records[0].data as Record<string, unknown>;

    expect(data.caution_skin_types).toEqual([]);
  });

  it("id 불일치: CSV의 id가 JSON에 없음 → PipelineError", () => {
    const enriched = [makeEnriched("brand")];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "nonexistent-uuid",
      is_approved: "true",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].recordId).toBe("nonexistent-uuid");
    expect(result.errors[0].message).toContain("not found");
  });

  it("id 누락: CSV 행에 id 없음 → PipelineError", () => {
    const enriched = [makeEnriched("brand")];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      is_approved: "true",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("missing id");
  });

  it("reviewedBy 옵션 전달", () => {
    const enriched = [makeEnriched("brand")];

    mockReadFileSync.mockReturnValue(JSON.stringify(enriched));
    mockParseCsvFile.mockReturnValue([{
      id: "uuid-brand-1",
      is_approved: "true",
      review_notes: "",
    }]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv", {
      reviewedBy: "admin-user",
    });

    expect(result.records[0].reviewedBy).toBe("admin-user");
  });
});

// ── export → import round-trip ─────────────────────────────

describe("export → import round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("export한 CSV를 그대로 import → 원본 data 보존", () => {
    const original = makeEnriched("product", {
      skin_types: ["dry", "normal"],
      concerns: ["dryness", "wrinkles"],
      description: { ko: "제품 설명", en: "Product desc", ja: "製品説明" },
      review_summary: { ko: "리뷰", en: "Review" },
      price: 25000,
      images: ["img1.jpg"],
    }, {
      classifiedFields: ["skin_types", "concerns"],
      confidence: { skin_types: 0.85, concerns: 0.78 },
    });

    // Export 실행 — CSV 행 캡처
    let capturedCsvRows: Record<string, string>[] = [];
    mockStringifyCsvRows.mockImplementation((rows: Record<string, string>[]) => {
      capturedCsvRows = rows;
      return "csv-content";
    });

    exportForReview([original], { outputDir: "/tmp/review", timestamp: FIXED_TIMESTAMP });

    // Import 시 export된 행을 그대로 사용 (is_approved만 추가)
    const importRow = { ...capturedCsvRows[0], is_approved: "TRUE" };

    mockReadFileSync.mockReturnValue(JSON.stringify([original]));
    mockParseCsvFile.mockReturnValue([importRow]);

    const result = importReviewed("/tmp/enriched.json", "/tmp/review.csv");

    expect(result.records).toHaveLength(1);
    const data = result.records[0].data as Record<string, unknown>;

    // 원본 보존 필드
    expect(data.id).toBe("uuid-product-1");
    expect(data.price).toBe(25000);
    expect(data.images).toEqual(["img1.jpg"]);

    // 검수 필드 round-trip
    expect(data.skin_types).toEqual(["dry", "normal"]);
    expect(data.concerns).toEqual(["dryness", "wrinkles"]);

    // ja 언어 보존 (CSV에 없지만 JSON에서 유지)
    const desc = data.description as Record<string, string>;
    expect(desc.ja).toBe("製品説明");
    expect(desc.ko).toBe("제품 설명");
    expect(desc.en).toBe("Product desc");
  });
});
