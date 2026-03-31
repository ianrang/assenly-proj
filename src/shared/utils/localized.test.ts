import { describe, it, expect } from "vitest";
import { localized } from "./localized";

describe("localized", () => {
  it("null → 빈 문자열", () => {
    expect(localized(null, "en")).toBe("");
  });

  it("undefined → 빈 문자열", () => {
    expect(localized(undefined, "en")).toBe("");
  });

  it("en 텍스트 정상 반환", () => {
    expect(localized({ en: "Hello" }, "en")).toBe("Hello");
  });

  it("다국어 locale 반환 (ja)", () => {
    expect(localized({ en: "Hello", ja: "こんにちは" }, "ja")).toBe("こんにちは");
  });

  it("미지원 locale → en 폴백", () => {
    expect(localized({ en: "Hello" }, "zh")).toBe("Hello");
  });

  it("en도 없는 경우 → 빈 문자열", () => {
    expect(localized({ en: "" }, "fr")).toBe("");
  });

  it("ko만 있고 locale=ko → ko 반환", () => {
    expect(localized({ en: "Hello", ko: "안녕" }, "ko")).toBe("안녕");
  });
});
