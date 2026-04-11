import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { groupParts } from "./group-parts";
import type { ChatMessagePart } from "./card-mapper";

// --- Test fixtures ---

const textPart = { type: "text" as const, text: "Hello" };
const textPart2 = { type: "text" as const, text: "World" };

const productPart = {
  type: "product-card" as const,
  product: { id: "p1" },
  brand: null,
  store: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

const productPart2 = {
  type: "product-card" as const,
  product: { id: "p2" },
  brand: null,
  store: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

const treatmentPart = {
  type: "treatment-card" as const,
  treatment: { id: "t1" },
  clinic: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

// v1.2 NEW-10: kit-cta-card 타입 제거됨. Kit CTA는 ProductCard(is_highlighted) 내부에 통합.
// kit-cta 관련 fixture와 인터리빙 테스트는 제거. 모든 카드는 동일한 cards 그룹으로 묶임.

// --- Tests ---

// --- MarkdownMessage role-based rendering ---
// MessageList는 assistant 텍스트에만 MarkdownMessage를 적용하고,
// user 텍스트는 plain text로 렌더링한다.
// 실제 렌더링 테스트는 RTL이 필요하므로 별도 파일이 적합하지만,
// groupParts의 출력 구조가 role 분기를 지원하는지 여기서 검증한다.

describe("groupParts role support", () => {
  it("text group은 role과 무관하게 동일한 구조를 반환한다", () => {
    const result = groupParts([textPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    // GroupedParts 컴포넌트에서 role별 분기 처리 (MessageList.tsx)
    // groupParts 자체는 role을 모름 — 순수 데이터 변환
  });

  it("cards group도 role과 무관하게 동일한 구조를 반환한다", () => {
    const result = groupParts([productPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cards");
  });
});

describe("groupParts", () => {
  it("빈 배열 → 빈 groups", () => {
    expect(groupParts([])).toEqual([]);
  });

  it("text만 → 각각 개별 text group", () => {
    const result = groupParts([textPart, textPart2]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("text");
  });

  it("단일 카드 → 1개 cards group", () => {
    const result = groupParts([productPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cards");
    if (result[0].type === "cards") {
      expect(result[0].cards).toHaveLength(1);
    }
  });

  it("연속 카드 → 1개 cards group", () => {
    const result = groupParts([productPart, productPart2, treatmentPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cards");
    if (result[0].type === "cards") {
      expect(result[0].cards).toHaveLength(3);
    }
  });

  it("text → cards → text 경계 정확", () => {
    const result = groupParts([textPart, productPart, productPart2, textPart2]);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("cards");
    expect(result[2].type).toBe("text");
    if (result[1].type === "cards") {
      expect(result[1].cards).toHaveLength(2);
    }
  });

  // v1.2 NEW-10: product와 treatment 카드가 인터리빙되어도 연속 그룹으로 묶인다.
  it("product → treatment → product 인터리빙 → 1개 cards group", () => {
    const result = groupParts([productPart, treatmentPart, productPart2]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cards");
    if (result[0].type === "cards") {
      expect(result[0].cards).toHaveLength(3);
    }
  });

  it("text → product → treatment → text 복합 시나리오", () => {
    const result = groupParts([textPart, productPart, treatmentPart, textPart2]);
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.type)).toEqual(["text", "cards", "text"]);
    if (result[1].type === "cards") {
      expect(result[1].cards).toHaveLength(2);
    }
  });
});
