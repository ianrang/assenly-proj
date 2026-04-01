// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: { COSING_CSV_PATH: "./data/cosing.csv" } as Record<string, unknown>,
}));

vi.mock("../../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

vi.mock("../csv-parser", () => ({
  parseCsvFile: vi.fn(),
}));

import { mapRowToRawRecord, loadCosIngIngredients } from "./cosing-csv";
import { parseCsvFile } from "../csv-parser";

const mockParseCsvFile = vi.mocked(parseCsvFile);

// ── Fixture: P2-V4 검증 기반 CosIng CSV 행 ────────────────

const FULL_ROW: Record<string, string> = {
  "COSING Ref No": "34117",
  "INCI name": "Niacinamide",
  "INN name": "Nicotinamide",
  "Ph. Eur. Name": "",
  "CAS No": "98-92-0",
  "EC No": "202-713-4",
  "Chem/IUPAC Name / Description": "pyridine-3-carboxamide",
  Restriction: "",
  Function: "SKIN CONDITIONING",
  "Update Date": "2020-12-30",
};

/** ISO 8601 형식 정규식 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── mapRowToRawRecord 테스트 ──────────────────────────────

describe("mapRowToRawRecord", () => {
  it("정상 CosIng 행을 RawRecord로 변환", () => {
    const result = mapRowToRawRecord(FULL_ROW);

    expect(result.source).toBe("cosing");
    expect(result.sourceId).toBe("Niacinamide");
    expect(result.entityType).toBe("ingredient");
    expect(result.fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("sourceId — INCI name 매핑", () => {
    const result = mapRowToRawRecord(FULL_ROW);

    expect(result.sourceId).toBe("Niacinamide");
  });

  it("INCI name 없으면 빈 문자열", () => {
    const row = { ...FULL_ROW, "INCI name": "" };
    const result = mapRowToRawRecord(row);

    expect(result.sourceId).toBe("");
  });

  it("data에 원본 전체 보존 (Function, Restriction, CAS No 접근 가능)", () => {
    const result = mapRowToRawRecord(FULL_ROW);

    expect(result.data).toBe(FULL_ROW);
    expect(result.data["Function"]).toBe("SKIN CONDITIONING");
    expect(result.data["Restriction"]).toBe("");
    expect(result.data["CAS No"]).toBe("98-92-0");
    expect(result.data["COSING Ref No"]).toBe("34117");
  });
});

// ── loadCosIngIngredients 테스트 ──────────────────────────

describe("loadCosIngIngredients", () => {
  beforeEach(() => {
    mockParseCsvFile.mockReset();
    mockPipelineEnv.COSING_CSV_PATH = "./data/cosing.csv";
  });

  it("정상 CSV 로드 → RawRecord[]", () => {
    const rows = [
      FULL_ROW,
      { ...FULL_ROW, "INCI name": "Retinol", "CAS No": "68-26-8" },
    ];
    mockParseCsvFile.mockReturnValue(rows);

    const result = loadCosIngIngredients();

    expect(result).toHaveLength(2);
    expect(result[0].sourceId).toBe("Niacinamide");
    expect(result[1].sourceId).toBe("Retinol");
  });

  it("INCI name dedup — 동일 INCI name 중복 제거", () => {
    mockParseCsvFile.mockReturnValue([FULL_ROW, FULL_ROW]);

    const result = loadCosIngIngredients();

    expect(result).toHaveLength(1);
  });

  it("빈 sourceId(INCI name) skip", () => {
    const emptyRow = { ...FULL_ROW, "INCI name": "" };
    mockParseCsvFile.mockReturnValue([emptyRow, FULL_ROW]);

    const result = loadCosIngIngredients();

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("Niacinamide");
  });

  it("parseCsvFile에 delimiter ';' 전달", () => {
    mockParseCsvFile.mockReturnValue([]);

    loadCosIngIngredients();

    expect(mockParseCsvFile).toHaveBeenCalledWith(
      "./data/cosing.csv",
      { delimiter: "," },
    );
  });

  it("COSING_CSV_PATH config 경유 확인", () => {
    mockPipelineEnv.COSING_CSV_PATH = "/custom/path/cosing.csv";
    mockParseCsvFile.mockReturnValue([]);

    loadCosIngIngredients();

    expect(mockParseCsvFile).toHaveBeenCalledWith(
      "/custom/path/cosing.csv",
      { delimiter: "," },
    );
  });

  it("빈 CSV → 빈 배열", () => {
    mockParseCsvFile.mockReturnValue([]);

    const result = loadCosIngIngredients();

    expect(result).toEqual([]);
  });
});
