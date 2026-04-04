// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ────────────────────────────────────────────

vi.mock("../config", () => ({
  pipelineEnv: { AI_PROVIDER: "google", NODE_ENV: "test" },
}));

// ── fs mock ────────────────────────────────────────────────

const { mockWriteFileSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: vi.fn(),
}));

// ── AI module mocks ────────────────────────────────────────

const { mockTranslateFields } = vi.hoisted(() => ({
  mockTranslateFields: vi.fn(),
}));

vi.mock("./enrichment/translator", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, translateFields: mockTranslateFields };
});

const { mockClassifyFields } = vi.hoisted(() => ({
  mockClassifyFields: vi.fn(),
}));

vi.mock("./enrichment/classifier", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, classifyFields: mockClassifyFields };
});

const { mockGenerateDescriptions } = vi.hoisted(() => ({
  mockGenerateDescriptions: vi.fn(),
}));

vi.mock("./enrichment/description-generator", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateDescriptions: mockGenerateDescriptions };
});

// ── id-generator mock ──────────────────────────────────────

const { mockGenerateEntityId } = vi.hoisted(() => ({
  mockGenerateEntityId: vi.fn().mockReturnValue("mock-uuid-v5"),
}));

vi.mock("./id-generator", () => ({
  generateEntityId: mockGenerateEntityId,
}));

// ── ai-client mock (translator/classifier/generator 내부 의존) ──

vi.mock("./enrichment/ai-client", () => ({
  getPipelineModel: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn() }));

// ── imports ────────────────────────────────────────────────

import { enrichRecords } from "./enrich-service";
import type { RawRecord } from "./types";

// ── 헬퍼 ──────────────────────────────────────────────────

function makeRecord(
  entityType: string,
  data: Record<string, unknown> = {},
): RawRecord {
  return {
    source: "csv",
    sourceId: `test-${entityType}`,
    entityType: entityType as RawRecord["entityType"],
    data: { name_ko: "테스트", ...data },
    fetchedAt: new Date().toISOString(),
  };
}

function mockTranslateSuccess() {
  mockTranslateFields.mockResolvedValue({
    translated: { name: { ko: "테스트", en: "Test", ja: "テスト", zh: "测试", es: "Prueba", fr: "Test" } },
    translatedFields: ["name"],
  });
}

function mockClassifySuccess() {
  mockClassifyFields.mockResolvedValue({
    classified: {
      skin_types: { values: ["dry", "normal"], confidence: 0.85 },
      concerns: { values: ["dryness"], confidence: 0.78 },
    },
    classifiedFields: ["skin_types", "concerns"],
  });
}

function mockGenerateSuccess() {
  mockGenerateDescriptions.mockResolvedValue({
    generated: {
      description: { ko: "제품 설명", en: "Product description" },
      review_summary: { ko: "리뷰 요약", en: "Review summary" },
    },
    generatedFields: ["description", "review_summary"],
  });
}

// ── enrichRecords ──────────────────────────────────────────

describe("enrichRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEntityId.mockReturnValue("mock-uuid-v5");
    mockTranslateFields.mockResolvedValue({ translated: {}, translatedFields: [] });
    mockClassifyFields.mockResolvedValue({ classified: {}, classifiedFields: [] });
    mockGenerateDescriptions.mockResolvedValue({ generated: {}, generatedFields: [] });
  });

  // ── product 전체 보강 ──

  it("product: 번역 + 분류(confidence) + 생성 + 재번역", async () => {
    mockTranslateSuccess();
    mockClassifySuccess();
    mockGenerateSuccess();

    const records = [makeRecord("product", {
      name_ko: "그린티 세럼",
      description_ko: "수분 세럼",
      category: "skincare",
    })];

    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched).toHaveLength(1);

    // UUID 생성
    expect(mockGenerateEntityId).toHaveBeenCalledWith("product", "csv", "test-product");
    expect(enriched[0].data.id).toBe("mock-uuid-v5");

    // 번역 호출
    expect(mockTranslateFields).toHaveBeenCalled();

    // 분류 호출 + confidence
    expect(mockClassifyFields).toHaveBeenCalled();
    expect(enriched[0].enrichments.confidence.skin_types).toBe(0.85);
    expect(enriched[0].enrichments.confidence.concerns).toBe(0.78);

    // 생성 호출
    expect(mockGenerateDescriptions).toHaveBeenCalled();

    // 재번역 호출 (생성된 en → ja/zh/es/fr)
    expect(mockTranslateFields).toHaveBeenCalledTimes(2); // 1회 기본 + 1회 재번역
  });

  // ── doctor 최소 보강 ──

  it("doctor: 번역만 (분류/생성 없음)", async () => {
    mockTranslateSuccess();

    const records = [makeRecord("doctor", { name_ko: "김의사" })];
    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched).toHaveLength(1);
    expect(mockTranslateFields).toHaveBeenCalledTimes(1);
    expect(mockClassifyFields).not.toHaveBeenCalled();
    expect(mockGenerateDescriptions).not.toHaveBeenCalled();
    expect(enriched[0].enrichments.classifiedFields).toHaveLength(0);
  });

  // ── ingredient 보강 ──

  it("ingredient: 번역 + function/caution_skin_types 분류 + inci_name 매핑", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "나이아신아마이드", en: "Niacinamide" } },
      translatedFields: ["name"],
    });
    mockClassifyFields.mockResolvedValue({
      classified: {
        function: { values: ["brightening", "barrier strengthening"], confidence: 0.9 },
        caution_skin_types: { values: ["sensitive"], confidence: 0.72 },
      },
      classifiedFields: ["function", "caution_skin_types"],
    });

    const records = [makeRecord("ingredient", {
      INGR_KOR_NAME: "나이아신아마이드",
      INGR_ENG_NAME: "Niacinamide",
      _cosing: { inciName: "NIACINAMIDE", function: "SKIN CONDITIONING", restriction: "" },
    })];
    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    // inci_name 매핑 (INGR_ENG_NAME → inci_name)
    expect(enriched[0].data.inci_name).toBe("Niacinamide");

    // function 분류 (strict=false)
    expect(enriched[0].enrichments.classifiedFields).toContain("function");
    expect(enriched[0].enrichments.confidence.function).toBe(0.9);
    expect(enriched[0].data.function).toEqual(["brightening", "barrier strengthening"]);

    // caution_skin_types 분류 (strict=true)
    expect(enriched[0].enrichments.classifiedFields).toContain("caution_skin_types");
    expect(enriched[0].enrichments.confidence.caution_skin_types).toBe(0.72);

    expect(mockGenerateDescriptions).not.toHaveBeenCalled();
  });

  it("ingredient: inci_name 폴백 — INGR_ENG_NAME 없으면 _cosing.inciName 사용", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "레티놀", en: "Retinol" } },
      translatedFields: ["name"],
    });
    mockClassifyFields.mockResolvedValue({
      classified: {
        function: { values: ["anti-aging"], confidence: 0.85 },
        caution_skin_types: { values: [], confidence: 0 },
      },
      classifiedFields: ["function"],
    });

    const records = [makeRecord("ingredient", {
      INGR_KOR_NAME: "레티놀",
      // INGR_ENG_NAME 없음
      _cosing: { inciName: "RETINOL", function: "SKIN CONDITIONING" },
    })];
    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    // _cosing.inciName 폴백
    expect(enriched[0].data.inci_name).toBe("RETINOL");
  });

  // ── treatment 보강 ──

  it("treatment: 번역 + target_concerns/suitable_skin_types + description", async () => {
    mockTranslateSuccess();
    mockClassifyFields.mockResolvedValue({
      classified: {
        suitable_skin_types: { values: ["dry"], confidence: 0.9 },
        target_concerns: { values: ["wrinkles"], confidence: 0.88 },
      },
      classifiedFields: ["suitable_skin_types", "target_concerns"],
    });
    mockGenerateDescriptions.mockResolvedValue({
      generated: { description: { ko: "시술 설명", en: "Treatment desc" } },
      generatedFields: ["description"],
    });

    const records = [makeRecord("treatment", { name_ko: "보톡스" })];
    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched[0].enrichments.classifiedFields).toContain("target_concerns");
    expect(enriched[0].enrichments.confidence.suitable_skin_types).toBe(0.9);
  });

  // ── store 보강: store_type + district 매핑 ──

  it("store: store_type 자동분류 + district 매핑 + description 생성", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "올리브영 강남역점", en: "Olive Young Gangnam" } },
      translatedFields: ["name"],
    });
    mockGenerateDescriptions.mockResolvedValue({
      generated: { description: { ko: "K-뷰티 매장", en: "K-beauty store" } },
      generatedFields: ["description"],
    });

    const records = [makeRecord("store", {
      name: { ko: "올리브영 강남역점", en: "" },
      address: { ko: "서울 강남구 강남대로 396" },
      location: { lat: 37.4979, lng: 127.0276 },
      raw: { category_name: "가정,생활 > 화장품" },
    })];

    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    // store_type 자동분류 (FIELD_MAPPINGS)
    expect(enriched[0].data.store_type).toBe("olive_young");

    // district 자동매핑 (FIELD_MAPPINGS)
    expect(enriched[0].data.district).toBe("gangnam");

    // description 생성
    expect(mockGenerateDescriptions).toHaveBeenCalled();

    // 분류 미호출 (classifySpecs=[])
    expect(mockClassifyFields).not.toHaveBeenCalled();
  });

  it("store: district 매핑 — 주소 없으면 null", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "매장", en: "Store" } },
      translatedFields: ["name"],
    });
    mockGenerateDescriptions.mockResolvedValue({
      generated: { description: { ko: "설명", en: "Desc" } },
      generatedFields: ["description"],
    });

    const records = [makeRecord("store", {
      name: { ko: "뷰티 매장", en: "" },
      raw: {},
    })];

    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched[0].data.district).toBeNull();
    expect(enriched[0].data.store_type).toBe("other");
  });

  // ── 건별 try-catch ──

  it("3건 중 2번째 에러 → 1,3번째 성공 + PipelineError 1건", async () => {
    mockTranslateSuccess();

    let callCount = 0;
    mockTranslateFields.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error("AI timeout");
      return { translated: { name: { ko: "ok", en: "ok" } }, translatedFields: ["name"] };
    });

    const records = [
      makeRecord("brand", { name_ko: "A" }),
      makeRecord("brand", { name_ko: "B" }),
      makeRecord("brand", { name_ko: "C" }),
    ];

    const { records: enriched, result } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched).toHaveLength(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain("AI timeout");
    expect(result.errors[0].recordId).toBe("test-brand");
  });

  // ── entityTypes 필터 ──

  it("entityTypes: product만 → brand 스킵", async () => {
    mockTranslateSuccess();
    mockClassifySuccess();
    mockGenerateSuccess();

    const records = [
      makeRecord("product", { name_ko: "세럼" }),
      makeRecord("brand", { name_ko: "이니스프리" }),
    ];

    const { records: enriched } = await enrichRecords(records, {
      entityTypes: ["product"],
      logDir: "/tmp",
    });

    expect(enriched).toHaveLength(1);
    expect(enriched[0].entityType).toBe("product");
  });

  // ── skip 옵션들 ──

  it("skipTranslation → translateFields 미호출", async () => {
    const records = [makeRecord("brand", { name_ko: "A" })];
    await enrichRecords(records, { skipTranslation: true, logDir: "/tmp" });
    expect(mockTranslateFields).not.toHaveBeenCalled();
  });

  it("skipClassification → classifyFields 미호출", async () => {
    mockTranslateSuccess();
    const records = [makeRecord("product", { name_ko: "A" })];
    await enrichRecords(records, { skipClassification: true, logDir: "/tmp" });
    expect(mockClassifyFields).not.toHaveBeenCalled();
  });

  it("skipGeneration → generateDescriptions 미호출", async () => {
    mockTranslateSuccess();
    const records = [makeRecord("product", { name_ko: "A" })];
    await enrichRecords(records, { skipGeneration: true, logDir: "/tmp" });
    expect(mockGenerateDescriptions).not.toHaveBeenCalled();
  });

  // ── targetLangs 오버라이드 ──

  it("targetLangs: ['en']만 → 재번역 없음", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "테스트", en: "Test" } },
      translatedFields: ["name"],
    });
    mockGenerateDescriptions.mockResolvedValue({
      generated: { description: { ko: "설명", en: "Desc" } },
      generatedFields: ["description"],
    });

    const records = [makeRecord("store", { name: { ko: "매장", en: "" } })];
    await enrichRecords(records, { targetLangs: ["en"], logDir: "/tmp" });

    // 번역 1회만 (재번역 없음)
    expect(mockTranslateFields).toHaveBeenCalledTimes(1);
  });

  // ── deterministic UUID ──

  it("data.id = generateEntityId 결과", async () => {
    mockGenerateEntityId.mockReturnValue("specific-uuid-123");

    const records = [makeRecord("brand", { name_ko: "A" })];
    const { records: enriched } = await enrichRecords(records, { logDir: "/tmp" });

    expect(enriched[0].data.id).toBe("specific-uuid-123");
  });

  // ── EnrichmentMetadata ──

  it("EnrichmentMetadata 정확 구성", async () => {
    mockTranslateFields.mockResolvedValue({
      translated: { name: { ko: "A", en: "A" } },
      translatedFields: ["name"],
    });
    mockClassifyFields.mockResolvedValue({
      classified: { skin_types: { values: ["dry"], confidence: 0.9 } },
      classifiedFields: ["skin_types"],
    });

    const records = [makeRecord("product", { name_ko: "A" })];
    const { records: enriched } = await enrichRecords(records, {
      skipGeneration: true,
      logDir: "/tmp",
    });

    const meta = enriched[0].enrichments;
    expect(meta.translatedFields).toContain("name");
    expect(meta.classifiedFields).toContain("skin_types");
    expect(meta.confidence.skin_types).toBe(0.9);
  });

  // ── treatment FIELD_MAPPINGS ──

  it("treatment: FIELD_MAPPINGS — duration_minutes, session_count, price_min, price_max 변환", async () => {
    const records: RawRecord[] = [
      {
        source: "csv",
        sourceId: "treat-botox-forehead",
        entityType: "treatment",
        data: {
          name_ko: "보톡스 이마",
          name_en: "Botox Forehead",
          category: "injection",
          duration_minutes: "20",
          session_count: "3~6개월마다 반복",
          price_min: "50000",
          price_max: "150000",
          downtime_days: "0",
          target_concerns: "wrinkles",
          suitable_skin_types: "dry|normal|combination|oily|sensitive",
        },
        fetchedAt: new Date().toISOString(),
      },
    ];

    const result = await enrichRecords(records, {
      skipTranslation: true,
      skipClassification: true,
      skipGeneration: true,
    });

    expect(result.records[0].data.duration_minutes).toBe(20);
    expect(result.records[0].data.session_count).toBe("3~6개월마다 반복");
    expect(result.records[0].data.price_min).toBe(50000);
    expect(result.records[0].data.price_max).toBe(150000);
  });

  it("treatment: FIELD_MAPPINGS — null/missing 필드 → null 반환", async () => {
    const records: RawRecord[] = [
      {
        source: "csv",
        sourceId: "treat-minimal",
        entityType: "treatment",
        data: {
          name_ko: "테스트 시술",
          name_en: "Test Treatment",
          category: "facial",
        },
        fetchedAt: new Date().toISOString(),
      },
    ];

    const result = await enrichRecords(records, {
      skipTranslation: true,
      skipClassification: true,
      skipGeneration: true,
    });

    expect(result.records[0].data.duration_minutes).toBeNull();
    expect(result.records[0].data.session_count).toBeNull();
    expect(result.records[0].data.price_min).toBeNull();
    expect(result.records[0].data.price_max).toBeNull();
  });

  // ── 빈 레코드 ──

  it("빈 배열 → 빈 결과 + PipelineResult.total=0", async () => {
    const { records: enriched, result } = await enrichRecords([], { logDir: "/tmp" });
    expect(enriched).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  // ── 로그 ──

  it("결과 JSON 로그 저장", async () => {
    await enrichRecords([], { logDir: "/tmp/logs" });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [path] = mockWriteFileSync.mock.calls[0];
    expect(path).toContain("/tmp/logs/enrich-");
  });
});
