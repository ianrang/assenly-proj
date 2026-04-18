import { describe, it, expect } from "vitest";
import { parseUsdPrice, USD_TO_KRW } from "./oy-parser";

describe("parseUsdPrice", () => {
  it("US$28.90 → KRW 변환", () => {
    expect(parseUsdPrice("US$28.90")).toBe(Math.round(28.9 * USD_TO_KRW));
  });

  it("U$12.50 → KRW 변환 (U + $ 형식)", () => {
    expect(parseUsdPrice("U$12.50")).toBe(Math.round(12.5 * USD_TO_KRW));
  });

  it("US$1,234.56 → 콤마 포함 KRW 변환", () => {
    expect(parseUsdPrice("US$1,234.56")).toBe(
      Math.round(1234.56 * USD_TO_KRW),
    );
  });

  it("빈 문자열 → null", () => {
    expect(parseUsdPrice("")).toBeNull();
  });

  it("가격 없는 텍스트 → null", () => {
    expect(parseUsdPrice("가격 없음")).toBeNull();
  });

  it("US$0 → null (0 이하 거부)", () => {
    expect(parseUsdPrice("US$0")).toBeNull();
  });

  it("US$-5 → null (음수 거부)", () => {
    expect(parseUsdPrice("US$-5")).toBeNull();
  });
});
