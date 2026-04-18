import { describe, it, expect } from "vitest";
import { shouldOverwrite, computeCategoryFallback } from "./backfill-price";

describe("shouldOverwrite", () => {
  it("(null, 'real') → true", () => {
    expect(shouldOverwrite(null, "real")).toBe(true);
  });

  it("('category-default', 'real') → true (낮은→높은 허용)", () => {
    expect(shouldOverwrite("category-default", "real")).toBe(true);
  });

  it("('real', 'category-default') → false (높은→낮은 금지)", () => {
    expect(shouldOverwrite("real", "category-default")).toBe(false);
  });

  it("('manual', 'real') → false (manual 최우선)", () => {
    expect(shouldOverwrite("manual", "real")).toBe(false);
  });

  it("('real', 'real') → false (동일 소스 중복 금지)", () => {
    expect(shouldOverwrite("real", "real")).toBe(false);
  });

  it("(null, 'category-default') → true", () => {
    expect(shouldOverwrite(null, "category-default")).toBe(true);
  });

  it("('manual', 'category-default') → false", () => {
    expect(shouldOverwrite("manual", "category-default")).toBe(false);
  });
});

describe("computeCategoryFallback", () => {
  const quantiles = {
    skincare: { p25: 20000, p75: 50000 },
    makeup: { p25: 15000, p75: 40000 },
  };

  it("존재하는 카테고리 → { priceMin, priceMax }", () => {
    expect(computeCategoryFallback("skincare", quantiles)).toEqual({
      priceMin: 20000,
      priceMax: 50000,
    });
  });

  it("존재하는 카테고리 (makeup)", () => {
    expect(computeCategoryFallback("makeup", quantiles)).toEqual({
      priceMin: 15000,
      priceMax: 40000,
    });
  });

  it("존재하지 않는 카테고리 → null", () => {
    expect(computeCategoryFallback("unknown", quantiles)).toBeNull();
  });
});
