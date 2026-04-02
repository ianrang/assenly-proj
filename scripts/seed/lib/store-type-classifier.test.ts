// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  RegexStoreTypeClassifier,
  defaultStoreTypeClassifier,
  type StoreTypeClassifier,
} from "./store-type-classifier";

// ── Fixture ──────────────────────────────────────────────

function makeData(
  nameKo: string,
  categoryName = "",
): Record<string, unknown> {
  return {
    name: { ko: nameKo, en: "" },
    raw: { category_name: categoryName },
  };
}

// ── RegexStoreTypeClassifier 테스트 ──────────────────────

describe("RegexStoreTypeClassifier", () => {
  const classifier = new RegexStoreTypeClassifier();

  it("올리브영 → olive_young", () => {
    expect(classifier.classify(makeData("올리브영 강남역점"))).toBe("olive_young");
  });

  it("Olive Young (영문) → olive_young", () => {
    expect(classifier.classify(makeData("Olive Young Gangnam"))).toBe("olive_young");
  });

  it("다이소 → daiso", () => {
    expect(classifier.classify(makeData("다이소 명동역점"))).toBe("daiso");
  });

  it("시코르 → chicor", () => {
    expect(classifier.classify(makeData("시코르 강남역점"))).toBe("chicor");
  });

  it("백화점 → department_store", () => {
    expect(classifier.classify(makeData("롯데백화점 잠실점"))).toBe("department_store");
  });

  it("더현대 → department_store", () => {
    expect(classifier.classify(makeData("더현대 서울"))).toBe("department_store");
  });

  it("갤러리아 → department_store", () => {
    expect(classifier.classify(makeData("갤러리아백화점 압구정점"))).toBe("department_store");
  });

  it("이니스프리 → brand_store", () => {
    expect(classifier.classify(makeData("이니스프리 명동점"))).toBe("brand_store");
  });

  it("설화수 플래그십 → brand_store", () => {
    expect(classifier.classify(makeData("설화수 북촌 플래그십"))).toBe("brand_store");
  });

  it("아모레성수 → brand_store", () => {
    expect(classifier.classify(makeData("아모레성수"))).toBe("brand_store");
  });

  it("닥터자르트 → brand_store", () => {
    expect(classifier.classify(makeData("닥터자르트 플래그십 강남"))).toBe("brand_store");
  });

  it("3CE 시네마 → brand_store", () => {
    expect(classifier.classify(makeData("3CE 시네마 명동점"))).toBe("brand_store");
  });

  it("약국 → pharmacy", () => {
    expect(classifier.classify(makeData("삼익약국"))).toBe("pharmacy");
  });

  it("네이처리퍼블릭 → brand_store", () => {
    expect(classifier.classify(makeData("네이처리퍼블릭 명동1번가점"))).toBe("brand_store");
  });

  it("홀리카홀리카 → brand_store", () => {
    expect(classifier.classify(makeData("홀리카홀리카 명동5호점"))).toBe("brand_store");
  });

  it("오프뷰티 → brand_store", () => {
    expect(classifier.classify(makeData("오프뷰티 광장시장점"))).toBe("brand_store");
  });

  it("바닐라코 → brand_store", () => {
    expect(classifier.classify(makeData("바닐라코 성수점"))).toBe("brand_store");
  });

  it("미매칭 → other (폴백)", () => {
    expect(classifier.classify(makeData("코스메존 가로수길"))).toBe("other");
  });

  it("category_name으로 매칭 (name 미매칭 시)", () => {
    const data = makeData("코스메존", "가정,생활 > 약국");
    expect(classifier.classify(data)).toBe("pharmacy");
  });

  it("name 우선 매칭 (category보다 name이 먼저)", () => {
    // name에 올리브영이 있으면 category와 무관하게 olive_young
    const data = makeData("올리브영 강남점", "가정,생활 > 화장품");
    expect(classifier.classify(data)).toBe("olive_young");
  });

  it("빈 데이터 → other", () => {
    expect(classifier.classify(makeData(""))).toBe("other");
  });

  it("name이 문자열인 경우도 처리", () => {
    const data = { name: "올리브영 명동점", raw: {} };
    expect(classifier.classify(data)).toBe("olive_young");
  });
});

// ── 인터페이스 계약 테스트 ────────────────────────────────

describe("StoreTypeClassifier interface", () => {
  it("defaultStoreTypeClassifier는 인터페이스 구현체", () => {
    const classifier: StoreTypeClassifier = defaultStoreTypeClassifier;
    expect(typeof classifier.classify).toBe("function");
  });

  it("classify는 항상 string 반환", () => {
    const result = defaultStoreTypeClassifier.classify({});
    expect(typeof result).toBe("string");
  });
});
