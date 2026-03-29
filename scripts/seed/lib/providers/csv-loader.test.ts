// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("../csv-parser", () => ({
  parseCsvFile: vi.fn(),
}));

import { loadCsvAsRawRecords } from "./csv-loader";
import { parseCsvFile } from "../csv-parser";

const mockParseCsvFile = vi.mocked(parseCsvFile);

// ── Fixture ───────────────────────────────────────────────

const PRODUCT_ROWS: Record<string, string>[] = [
  { id: "p001", name: "Green Tea Serum", brand: "Innisfree", price: "25000" },
  { id: "p002", name: "Snail Mucin", brand: "COSRX", price: "18000" },
];

// ── loadCsvAsRawRecords 테스트 ─────────────────────────────

/** ISO 8601 형식 정규식 (RawRecord.fetchedAt 계약) */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("loadCsvAsRawRecords", () => {
  it("CSV → RawRecord[] 정상 변환", () => {
    mockParseCsvFile.mockReturnValue(PRODUCT_ROWS);

    const result = loadCsvAsRawRecords("./data/products.csv", "product");

    expect(result).toHaveLength(2);
    expect(result[0].source).toBe("csv");
    expect(result[0].sourceId).toBe("p001");
    expect(result[0].entityType).toBe("product");
    expect(result[0].data).toBe(PRODUCT_ROWS[0]);
    expect(result[0].fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("sourceId — id 컬럼 매핑", () => {
    mockParseCsvFile.mockReturnValue(PRODUCT_ROWS);

    const result = loadCsvAsRawRecords("./data/products.csv", "product");

    expect(result[0].sourceId).toBe("p001");
    expect(result[1].sourceId).toBe("p002");
  });

  it("idColumn 커스텀 — 다른 ID 컬럼명 지정", () => {
    const rows = [{ inci_name: "Niacinamide", function: "SKIN CONDITIONING" }];
    mockParseCsvFile.mockReturnValue(rows);

    const result = loadCsvAsRawRecords("./data/cosing.csv", "ingredient", {
      idColumn: "inci_name",
    });

    expect(result[0].sourceId).toBe("Niacinamide");
  });

  it("id 컬럼 없는 CSV → csv-${index} 폴백", () => {
    const rows = [{ name: "Serum" }, { name: "Toner" }];
    mockParseCsvFile.mockReturnValue(rows);

    const result = loadCsvAsRawRecords("./data/products.csv", "product");

    expect(result[0].sourceId).toBe("csv-0");
    expect(result[1].sourceId).toBe("csv-1");
  });

  it("빈 CSV → 빈 배열", () => {
    mockParseCsvFile.mockReturnValue([]);

    const result = loadCsvAsRawRecords("./data/empty.csv", "product");

    expect(result).toEqual([]);
  });

  it("parseCsvFile에 filePath와 options 전달 검증", () => {
    mockParseCsvFile.mockReturnValue([]);
    const options = { delimiter: ";", idColumn: "inci_name" };

    loadCsvAsRawRecords("./data/cosing.csv", "ingredient", options);

    expect(mockParseCsvFile).toHaveBeenCalledWith("./data/cosing.csv", options);
  });

  it("fetchedAt — 동일 배치 내 일관된 타임스탬프", () => {
    mockParseCsvFile.mockReturnValue(PRODUCT_ROWS);

    const result = loadCsvAsRawRecords("./data/products.csv", "product");

    expect(result[0].fetchedAt).toBe(result[1].fetchedAt);
  });
});
