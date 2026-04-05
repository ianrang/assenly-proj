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

  // P2-65: 누락 브랜드 패턴 추가분
  it("AHC → brand_store", () => {
    expect(classifier.classify(makeData("AHC PLAYZONE 중앙로점"))).toBe("brand_store");
  });

  it("러쉬 → brand_store", () => {
    expect(classifier.classify(makeData("러쉬 명동역점"))).toBe("brand_store");
  });

  it("바비브라운 → brand_store", () => {
    expect(classifier.classify(makeData("바비브라운 강남"))).toBe("brand_store");
  });

  it("투쿨포스쿨 → brand_store", () => {
    expect(classifier.classify(makeData("투쿨포스쿨 홍대2호 작업실"))).toBe("brand_store");
  });

  it("코리아나화장품 → brand_store", () => {
    expect(classifier.classify(makeData("코리아나화장품"))).toBe("brand_store");
  });

  it("에이지 투웨니스 → brand_store", () => {
    expect(classifier.classify(makeData("에이지 투웨니스"))).toBe("brand_store");
  });

  it("오휘 → brand_store", () => {
    expect(classifier.classify(makeData("오휘 명동대리점"))).toBe("brand_store");
  });

  it("엔프라니 홀리카 → brand_store", () => {
    expect(classifier.classify(makeData("엔프라니 홀리카 명동3번가점"))).toBe("brand_store");
  });

  it("네이처컬렉션 → brand_store", () => {
    expect(classifier.classify(makeData("네이처컬렉션 강남역사점"))).toBe("brand_store");
  });

  it("맥코스메틱 (백화점 내 매장) → department_store (백화점 우선)", () => {
    // 백화점 내 브랜드 카운터 → department_store 규칙이 우선 매칭
    expect(classifier.classify(makeData("맥코스메틱 롯데백화점본점"))).toBe("department_store");
  });

  it("맥코스메틱 (독립 매장) → brand_store", () => {
    expect(classifier.classify(makeData("맥코스메틱 명동점"))).toBe("brand_store");
  });

  // P2-65: department_store 오분류 수정
  it("화장품도매백화점 → other (소매시장, 백화점 아님)", () => {
    expect(classifier.classify(makeData("화장품도매백화점"))).toBe("other");
  });

  it("굴다리화장품백화점 → other (소매시장, 백화점 아님)", () => {
    expect(classifier.classify(makeData("굴다리화장품백화점"))).toBe("other");
  });

  it("화장품백화점 → other (소매시장, 백화점 아님)", () => {
    expect(classifier.classify(makeData("화장품백화점"))).toBe("other");
  });

  it("신세계백화점 → department_store (정상)", () => {
    expect(classifier.classify(makeData("디올 화장품 신세계백화점 강남점"))).toBe("department_store");
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
