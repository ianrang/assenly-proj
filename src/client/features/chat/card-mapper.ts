import "client-only";

import type { Product, Treatment, LocalizedText } from "@/shared/types/domain";

// ============================================================
// card-mapper — UIMessage.parts → ChatMessagePart[] 변환
// MessageList가 렌더링할 단순화된 파트 배열 생성.
// L-0b: client-only guard. 순수 유틸 (no "use client").
// ============================================================

/** AI SDK UIMessage.parts의 구조적 인터페이스 (직접 의존 회피) */
export type UIPartLike = {
  type: string;
  text?: string;
  state?: string;
  input?: { domain?: string };
  output?: unknown;
};

// --- Output Types ---

export type ChatMessagePart =
  | { type: "text"; text: string }
  | ProductCardPart
  | TreatmentCardPart
  | KitCtaCardPart;

export type KitCtaCardPart = {
  type: "kit-cta-card";
  productName: LocalizedText;
  highlightBadge: LocalizedText | null;
};

export type ProductCardPart = {
  type: "product-card";
  product: Product;
  brand: null;
  store: { name: LocalizedText; map_url?: string } | null;
  whyRecommended: string | undefined;
};

export type TreatmentCardPart = {
  type: "treatment-card";
  treatment: Treatment;
  clinic: { name: LocalizedText; booking_url?: string | null } | null;
  whyRecommended: string | undefined;
};

// --- Tool output shape from search-handler ---

interface ToolProductCard extends Product {
  reasons: string[];
  stores: ToolStore[];
}

interface ToolTreatmentCard extends Treatment {
  reasons: string[];
  clinics: ToolClinic[];
}

interface ToolStore {
  id: string;
  name: LocalizedText;
  district: string | null;
  english_support: string;
  store_type: string | null;
  rating: number | null;
  external_links: Array<{ type: string; url: string }> | null;
}

interface ToolClinic {
  id: string;
  name: LocalizedText;
  district: string | null;
  english_support: string;
  clinic_type: string | null;
  rating: number | null;
  booking_url: string | null;
}

interface ToolOutput {
  cards: unknown[];
  total: number;
}

// --- Whitelist ---

const TOOL_WHITELIST = ["search_beauty_data"] as const;

// --- Public API ---

export function mapUIMessageToParts(parts: UIPartLike[]): ChatMessagePart[] {
  const result: ChatMessagePart[] = [];

  for (const part of parts) {
    if (part.type === "text" && part.text !== undefined) {
      result.push({ type: "text", text: part.text });
      continue;
    }

    if (!isWhitelistedToolPart(part)) continue;
    if (part.state !== "output-available") continue;

    const raw = part.output;
    if (!raw || typeof raw !== "object" || !("cards" in raw)) continue;

    const output = raw as ToolOutput;
    const domain = part.input?.domain;
    mapToolCards(output.cards, domain, result);
  }

  return result;
}

// --- Helpers ---

function isWhitelistedToolPart(part: UIPartLike): boolean {
  return TOOL_WHITELIST.some((name) => part.type === `tool-${name}`);
}

function mapToolCards(cards: unknown[], domain: string | undefined, result: ChatMessagePart[]): void {
  for (const card of cards) {
    if (!card || typeof card !== "object") continue;

    if (domain === "shopping") {
      result.push(...mapProductCard(card as ToolProductCard));
    } else if (domain === "treatment") {
      result.push(mapTreatmentCard(card as ToolTreatmentCard));
    }
  }
}

function mapProductCard(card: ToolProductCard): ChatMessagePart[] {
  const { reasons, stores, ...product } = card;
  const firstStore = stores[0] ?? null;

  const parts: ChatMessagePart[] = [
    {
      type: "product-card",
      product,
      brand: null,
      store: firstStore ? { name: firstStore.name, map_url: extractMapUrl(firstStore.external_links) } : null,
      whyRecommended: reasons[0] ?? undefined,
    },
  ];

  // VP-1: is_highlighted → KitCtaCard 삽입 (렌더링만, 정렬/필터 미영향)
  if (product.is_highlighted && product.highlight_badge !== null) {
    parts.push({
      type: "kit-cta-card",
      productName: product.name,
      highlightBadge: product.highlight_badge,
    });
  }

  return parts;
}

function mapTreatmentCard(card: ToolTreatmentCard): TreatmentCardPart {
  const { reasons, clinics, ...treatment } = card;
  const firstClinic = clinics[0] ?? null;

  return {
    type: "treatment-card",
    treatment,
    clinic: firstClinic
      ? { name: firstClinic.name, booking_url: firstClinic.booking_url }
      : null,
    whyRecommended: reasons[0] ?? undefined,
  };
}

const MAP_LINK_TYPES = ["kakao_map", "naver_map", "map"];

function extractMapUrl(links: Array<{ type: string; url: string }> | null): string | undefined {
  if (!links) return undefined;
  const mapLink = links.find((l) => MAP_LINK_TYPES.includes(l.type));
  return mapLink?.url;
}
