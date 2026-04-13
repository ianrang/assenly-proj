import "client-only";

import type { ChatMessagePart } from "./card-mapper";

// ============================================================
// 카드 파트 그룹화 유틸 — P2-94, v1.2 simplified
// text 파트와 카드 파트(product/treatment)를 교차 배치.
// 연속된 카드는 가로 스크롤 그룹으로 묶음.
// 순수 함수: 부작용 없음. DB/API 호출 없음.
//
// v1.2 (NEW-10): kit-cta-card 타입 제거 → standalone 분기 제거.
// Kit CTA는 ProductCard(is_highlighted) 내부에 통합.
// ============================================================

export type PartGroup =
  | { type: "text"; part: { type: "text"; text: string } }
  | { type: "cards"; cards: ChatMessagePart[] };

/** parts 배열에서 연속 product/treatment 카드를 가로 스크롤 그룹으로 묶음 */
export function groupParts(parts: ChatMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let cardBuffer: ChatMessagePart[] = [];

  function flushCards() {
    if (cardBuffer.length > 0) {
      groups.push({ type: "cards", cards: [...cardBuffer] });
      cardBuffer = [];
    }
  }

  for (const part of parts) {
    if (part.type === "text") {
      flushCards();
      groups.push({ type: "text", part });
    } else {
      // product-card, treatment-card, store-card, clinic-card
      cardBuffer.push(part);
    }
  }
  flushCards();

  return groups;
}

/** 카드 파트에서 안정적인 React key 추출 */
export function cardKey(part: ChatMessagePart): string {
  if (part.type === "product-card") return part.product.id;
  if (part.type === "treatment-card") return part.treatment.id;
  if (part.type === "store-card") return part.store.id;
  if (part.type === "clinic-card") return part.clinic.id;
  return part.type;
}
