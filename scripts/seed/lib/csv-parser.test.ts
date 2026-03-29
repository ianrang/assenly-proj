// @vitest-environment node
import { describe, it, expect } from "vitest";

import { parseCsvString } from "./csv-parser";

// ── parseCsvString 테스트 ─────────────────────────────────

describe("parseCsvString", () => {
  it("기본 CSV 파싱 — 헤더→키, 행→Record", () => {
    const csv = "name,price,category\nSerum,25000,skincare\nToner,18000,skincare";
    const result = parseCsvString(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Serum",
      price: "25000",
      category: "skincare",
    });
    expect(result[1]).toEqual({
      name: "Toner",
      price: "18000",
      category: "skincare",
    });
  });

  it("빈 행 건너뛰기 (기본 skipEmptyLines=true)", () => {
    const csv = "id,name\n1,A\n\n2,B\n";
    const result = parseCsvString(csv);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("세미콜론 구분자 (CosIng EU CSV 대응)", () => {
    const csv = "inci_name;function;cas_no\nNiacinamide;SKIN CONDITIONING;98-92-0";
    const result = parseCsvString(csv, { delimiter: ";" });

    expect(result).toHaveLength(1);
    expect(result[0].inci_name).toBe("Niacinamide");
    expect(result[0].function).toBe("SKIN CONDITIONING");
    expect(result[0].cas_no).toBe("98-92-0");
  });

  it("인용 부호 — 쉼표 포함 필드 정상 파싱", () => {
    const csv = 'name,description\n"Green Tea Serum","hydrating, soothing"';
    const result = parseCsvString(csv);

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("hydrating, soothing");
  });

  it("공백 trim (기본 trim=true)", () => {
    const csv = "name , price \n Serum , 25000 ";
    const result = parseCsvString(csv);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serum");
    expect(result[0].price).toBe("25000");
  });

  it("빈 CSV (헤더만) → 빈 배열", () => {
    const csv = "name,price,category\n";
    const result = parseCsvString(csv);

    expect(result).toEqual([]);
  });

  it("UTF-8 BOM 처리", () => {
    const bom = "\uFEFF";
    const csv = `${bom}name,price\nSerum,25000`;
    const result = parseCsvString(csv);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serum");
  });
});
