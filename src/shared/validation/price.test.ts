import { describe, it, expect } from "vitest";

import { productCreateSchema } from "./product";
import { treatmentCreateSchema } from "./treatment";

// ============================================================
// NEW-37: products/treatments 가격 스키마 확장 검증
// DB CHECK 제약과 zod 스키마의 정합성(Q-14) 확인.
// ============================================================

const baseProduct = {
  name: { en: "Test", ko: "테스트" },
};

const baseTreatment = {
  name: { en: "Test", ko: "테스트" },
};

describe("productCreateSchema — price metadata", () => {
  it("기본값: price_currency='KRW', price_source/range_source 생략 가능", () => {
    const result = productCreateSchema.parse({ ...baseProduct });
    expect(result.price_currency).toBe("KRW");
    expect(result.price_source).toBeUndefined();
  });

  it("유효한 price_source enum 허용", () => {
    for (const s of ["manual", "real", "estimated-pipeline", "estimated-ai", "category-default"] as const) {
      const r = productCreateSchema.parse({ ...baseProduct, price_source: s });
      expect(r.price_source).toBe(s);
    }
  });

  it("잘못된 price_source enum 거부", () => {
    expect(() =>
      productCreateSchema.parse({ ...baseProduct, price_source: "guess" }),
    ).toThrow();
  });

  it("currency 화이트리스트 외 거부 (KRW/USD/JPY/CNY/EUR)", () => {
    expect(() =>
      productCreateSchema.parse({ ...baseProduct, price_currency: "GBP" }),
    ).toThrow();
  });

  it("price_min > price_max 거부 (DB CHECK 대응)", () => {
    expect(() =>
      productCreateSchema.parse({
        ...baseProduct,
        price_min: 30000,
        price_max: 10000,
      }),
    ).toThrow(/price_min/);
  });

  it("price_min <= price_max 허용", () => {
    const r = productCreateSchema.parse({
      ...baseProduct,
      price_min: 10000,
      price_max: 30000,
    });
    expect(r.price_min).toBe(10000);
    expect(r.price_max).toBe(30000);
  });

  it("price와 price_min/max 독립 (해석 B): price가 범위 밖이어도 허용 — 세일 수용", () => {
    const r = productCreateSchema.parse({
      ...baseProduct,
      price: 5000,
      price_min: 10000,
      price_max: 30000,
    });
    expect(r.price).toBe(5000);
  });
});

describe("treatmentCreateSchema — price metadata", () => {
  it("price(대표 판매가) null 허용 + price_min/max 기존 유지", () => {
    const r = treatmentCreateSchema.parse({
      ...baseTreatment,
      price_min: 100000,
      price_max: 200000,
    });
    expect(r.price_min).toBe(100000);
    expect(r.price_currency).toBe("KRW");
  });

  it("range_source enum 거부", () => {
    expect(() =>
      treatmentCreateSchema.parse({ ...baseTreatment, range_source: "fake" }),
    ).toThrow();
  });

  it("price_min > price_max 거부", () => {
    expect(() =>
      treatmentCreateSchema.parse({
        ...baseTreatment,
        price_min: 500000,
        price_max: 100000,
      }),
    ).toThrow();
  });
});
