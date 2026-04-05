# P2-51: Chat Card Rendering Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ChatInterface에서 `search_beauty_data` tool-result 파트를 ProductCard/TreatmentCard로 인라인 렌더링한다.

**Architecture:** AI SDK `useChat`의 `UIMessage.parts` 배열을 card-mapper가 중간 표현(`ChatMessagePart[]`)으로 변환하고, MessageList가 파트 타입별로 MessageBubble 또는 카드 컴포넌트를 렌더링한다. 하나의 assistant 메시지는 MessageGroup으로 묶어 시각적 응집성을 보장한다.

**Tech Stack:** AI SDK v6 (`ai@6.0.116`, `@ai-sdk/react@3.0.143`), React 19, TypeScript, Tailwind CSS 4

---

## Confirmed Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| A | Tool parts: `type: 'tool-search_beauty_data'`, `state: 'output-available'` | AI SDK static tool → SSE `dynamic: false` → client `type: 'tool-{name}'` 확인 |
| B | MessageList에서 파트별 분기 (카드는 MessageBubble sibling) | user-screens §6.1 컴포넌트 트리 |
| C | `client/features/chat/card-mapper.ts`에 매핑 유틸 + 타입 정의 | L-14 모듈 내부 전용, G-9 export 최소화 |
| D | `reasons[0]` → `whyRecommended` (MVP) | 설계 이상은 LLM 가공이나 추출 메커니즘 미존재. card-mapper 1파일 수정으로 확장 가능 |
| E | KitCtaCard 트리거: 별도 이벤트 불필요, 구조적 접근성만 보장 | P2-40에서 구현 |
| F | ChatMessage 타입: string content → parts 배열 | card-mapper.ts에서 타입 정의 |
| G | locale: prop drilling (ChatInterface → MessageList → Card) | 깊이 1단계, Context 과잉 |
| H | 스트리밍 중: output-available만 카드 렌더링, 중간 상태 무시 | MVP 최소, StreamingIndicator 기존 유지 |
| 신규 | `extract_user_profile`, `get_external_links` tool 파트는 필터링 (화이트리스트) | 내부 tool 결과 사용자 노출 방지 |
| 신규 | store/clinic: `[0]` 선택 (MVP) | LLM 구조화 선택 메커니즘 미존재. search-handler가 이미 필터링 |
| 신규 | stayDays: MVP에서 null (downtime 경고 미표시) | journey 데이터 클라이언트 미존재. VP-3 null-safe |

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `src/client/features/chat/card-mapper.ts` | AI SDK tool 파트 → `ChatMessagePart[]` 변환. 타입 정의 |
| **Create** | `src/client/features/chat/card-mapper.test.ts` | card-mapper 단위 테스트 |
| **Create** | `src/client/features/chat/MessageGroup.tsx` | 동일 메시지의 파트들을 시각적으로 묶는 래퍼 |
| **Modify** | `src/client/features/chat/ChatInterface.tsx` | UIMessage.parts → card-mapper → MessageList에 전달 |
| **Modify** | `src/client/features/chat/MessageList.tsx` | ChatMessage 타입 변경 + 파트별 분기 렌더링 |
| **Unchanged** | `src/client/features/chat/MessageBubble.tsx` | 변경 없음 (`children: ReactNode` 유지) |
| **Unchanged** | `src/client/features/cards/ProductCard.tsx` | 변경 없음 (기존 props 그대로 사용) |
| **Unchanged** | `src/client/features/cards/TreatmentCard.tsx` | 변경 없음 |

---

## Task 1: card-mapper 타입 정의 + 매핑 함수 테스트 작성

**Files:**
- Create: `src/client/features/chat/card-mapper.test.ts`

- [ ] **Step 1: card-mapper 테스트 파일 생성**

`card-mapper.test.ts`에 3개 테스트 케이스를 작성한다:
1. text 파트만 있는 메시지 → text ChatMessagePart만 반환
2. search_beauty_data tool (shopping) + text → text + product-card 파트 반환
3. extract_user_profile tool → 필터링되어 결과에 미포함

```typescript
import { describe, it, expect } from "vitest";
import { mapUIMessageToParts, type ChatMessagePart } from "./card-mapper";

// --- fixtures ---

const textOnlyParts = [
  { type: "text" as const, text: "Hello, how can I help?" },
];

const shoppingToolPart = {
  type: "tool-search_beauty_data" as const,
  toolCallId: "call-1",
  state: "output-available" as const,
  input: { query: "moisturizer", domain: "shopping" as const, limit: 3 },
  output: {
    cards: [
      {
        id: "prod-1",
        name: { en: "COSRX Snail Mucin" },
        description: null,
        brand_id: "brand-1",
        category: "skincare",
        subcategory: null,
        skin_types: ["combination"],
        hair_types: [],
        concerns: [],
        key_ingredients: ["snail mucin"],
        price: 18000,
        volume: "100ml",
        purchase_links: [{ platform: "olive_young", url: "https://example.com" }],
        english_label: true,
        tourist_popular: true,
        is_highlighted: false,
        highlight_badge: null,
        rating: 4.5,
        review_count: 120,
        review_summary: null,
        images: ["https://img.example.com/1.webp"],
        tags: ["hydrating", "snail mucin"],
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        reasons: ["Contains snail mucin for hydration", "Suitable for combination skin"],
        brand: { id: "brand-1", name: { en: "COSRX" } },
        stores: [
          {
            id: "store-1",
            name: { en: "Olive Young Myeongdong" },
            district: "Jung-gu",
            map_url: "https://map.kakao.com/abc",
            english_support: "fluent",
          },
          {
            id: "store-2",
            name: { en: "Olive Young Gangnam" },
            district: "Gangnam-gu",
            map_url: "https://map.kakao.com/def",
            english_support: "basic",
          },
        ],
      },
    ],
    total: 1,
  },
};

const treatmentToolPart = {
  type: "tool-search_beauty_data" as const,
  toolCallId: "call-2",
  state: "output-available" as const,
  input: { query: "facial", domain: "treatment" as const, limit: 3 },
  output: {
    cards: [
      {
        id: "treat-1",
        name: { en: "Aqua Peel" },
        description: null,
        category: "facial",
        subcategory: null,
        target_concerns: ["pores"],
        suitable_skin_types: ["combination"],
        price_min: 80000,
        price_max: 150000,
        price_currency: "KRW",
        duration_minutes: 45,
        downtime_days: 1,
        session_count: null,
        precautions: null,
        aftercare: null,
        is_highlighted: false,
        highlight_badge: null,
        rating: 4.2,
        review_count: 50,
        images: [],
        tags: ["pore care"],
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        reasons: ["Targets pore concerns", "Minimal downtime fits 5-day stay"],
        clinics: [
          {
            id: "clinic-1",
            name: { en: "Gangnam Derma" },
            district: "Gangnam-gu",
            map_url: "https://map.kakao.com/ghi",
            booking_url: "https://booking.example.com",
            english_support: "fluent",
          },
        ],
      },
    ],
    total: 1,
  },
};

const extractToolPart = {
  type: "tool-extract_user_profile" as const,
  toolCallId: "call-3",
  state: "output-available" as const,
  input: { skin_type: "combination" },
  output: { skin_type: "combination", age_range: null },
};

const linksToolPart = {
  type: "tool-get_external_links" as const,
  toolCallId: "call-4",
  state: "output-available" as const,
  input: { entity_id: "prod-1", entity_type: "product" },
  output: { links: [] },
};

// --- tests ---

describe("mapUIMessageToParts", () => {
  it("text-only 메시지 → text 파트만 반환", () => {
    const result = mapUIMessageToParts(textOnlyParts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "text", text: "Hello, how can I help?" });
  });

  it("shopping tool-result → product-card 파트로 변환", () => {
    const parts = [
      { type: "text" as const, text: "Here are my recommendations:" },
      shoppingToolPart,
    ];

    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text", text: "Here are my recommendations:" });

    const card = result[1];
    expect(card.type).toBe("product-card");
    if (card.type !== "product-card") throw new Error("unreachable");
    expect(card.product.id).toBe("prod-1");
    expect(card.product.name).toEqual({ en: "COSRX Snail Mucin" });
    expect(card.brand).toEqual({ name: { en: "COSRX" } });
    // MVP: stores[0] 선택
    expect(card.store).toEqual({ name: { en: "Olive Young Myeongdong" }, map_url: "https://map.kakao.com/abc" });
    // MVP: reasons[0]
    expect(card.whyRecommended).toBe("Contains snail mucin for hydration");
  });

  it("treatment tool-result → treatment-card 파트로 변환", () => {
    const parts = [treatmentToolPart];

    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    const card = result[0];
    expect(card.type).toBe("treatment-card");
    if (card.type !== "treatment-card") throw new Error("unreachable");
    expect(card.treatment.id).toBe("treat-1");
    expect(card.clinic).toEqual({
      name: { en: "Gangnam Derma" },
      booking_url: "https://booking.example.com",
    });
    expect(card.whyRecommended).toBe("Targets pore concerns");
  });

  it("extract_user_profile tool → 필터링 (카드 미생성)", () => {
    const parts = [
      { type: "text" as const, text: "Got it." },
      extractToolPart,
    ];

    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
  });

  it("get_external_links tool → 필터링 (카드 미생성)", () => {
    const parts = [
      { type: "text" as const, text: "Here's the link." },
      linksToolPart,
    ];

    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
  });

  it("output-available 아닌 tool → 무시", () => {
    const pendingTool = {
      ...shoppingToolPart,
      state: "input-available" as const,
      output: undefined,
    };

    const result = mapUIMessageToParts([pendingTool]);

    expect(result).toHaveLength(0);
  });

  it("shopping 카드 복수 → product-card 파트 복수 생성", () => {
    const multiCard = {
      ...shoppingToolPart,
      output: {
        cards: [
          shoppingToolPart.output.cards[0],
          {
            ...shoppingToolPart.output.cards[0],
            id: "prod-2",
            name: { en: "SOME BY MI Toner" },
            reasons: ["Good for pore care"],
            stores: [],
          },
        ],
        total: 2,
      },
    };

    const result = mapUIMessageToParts([multiCard]);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("product-card");
    expect(result[1].type).toBe("product-card");
    if (result[1].type !== "product-card") throw new Error("unreachable");
    // stores 빈 배열 → store null
    expect(result[1].store).toBeNull();
    expect(result[1].whyRecommended).toBe("Good for pore care");
  });

  it("reasons 빈 배열 → whyRecommended undefined", () => {
    const noReasons = {
      ...shoppingToolPart,
      output: {
        cards: [{ ...shoppingToolPart.output.cards[0], reasons: [] }],
        total: 1,
      },
    };

    const result = mapUIMessageToParts([noReasons]);

    expect(result).toHaveLength(1);
    if (result[0].type !== "product-card") throw new Error("unreachable");
    expect(result[0].whyRecommended).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run src/client/features/chat/card-mapper.test.ts`
Expected: FAIL — `Cannot find module './card-mapper'`

---

## Task 2: card-mapper 구현

**Files:**
- Create: `src/client/features/chat/card-mapper.ts`

- [ ] **Step 3: card-mapper.ts 작성**

```typescript
"use client";

import "client-only";

import type { Product, Treatment, LocalizedText } from "@/shared/types/domain";

// ============================================================
// Card Mapper — P2-51
// AI SDK UIMessage.parts → ChatMessagePart[] 변환.
// 화이트리스트: search_beauty_data tool만 카드 변환.
// extract_user_profile, get_external_links 등 다른 tool은 무시.
// ============================================================

// --- 출력 타입 (MessageList가 소비) ---

export type ChatMessagePart =
  | { type: "text"; text: string }
  | ProductCardPart
  | TreatmentCardPart;

export type ProductCardPart = {
  type: "product-card";
  product: Product;
  brand: { name: LocalizedText } | null;
  store: { name: LocalizedText; map_url?: string } | null;
  whyRecommended: string | undefined;
};

export type TreatmentCardPart = {
  type: "treatment-card";
  treatment: Treatment;
  clinic: { name: LocalizedText; booking_url?: string | null } | null;
  whyRecommended: string | undefined;
};

// --- tool output 내부 타입 (card-mapper 전용, L-14) ---

interface ToolStore {
  id: string;
  name: LocalizedText;
  district?: string;
  map_url?: string;
  english_support?: string;
}

interface ToolClinic {
  id: string;
  name: LocalizedText;
  district?: string;
  map_url?: string;
  booking_url?: string;
  english_support?: string;
}

interface ToolProductCard extends Product {
  reasons: string[];
  brand?: { id: string; name: LocalizedText } | null;
  stores: ToolStore[];
}

interface ToolTreatmentCard extends Treatment {
  reasons: string[];
  clinics: ToolClinic[];
}

interface SearchToolOutput {
  cards: Array<ToolProductCard | ToolTreatmentCard>;
  total: number;
  error?: string;
}

// --- AI SDK 파트에서 필요한 최소 형상 (SDK 타입 직접 의존 회피) ---

interface UIPartLike {
  type: string;
  text?: string;
  state?: string;
  input?: { domain?: string };
  output?: unknown;
}

const SEARCH_TOOL_TYPE = "tool-search_beauty_data";

/**
 * AI SDK UIMessage.parts → ChatMessagePart[] 변환.
 *
 * - text 파트 → 그대로 전달
 * - search_beauty_data tool (output-available) → product-card / treatment-card
 * - 그 외 tool → 무시 (extract_user_profile, get_external_links 등)
 *
 * MVP: store/clinic는 [0] 선택 (설계: AI 선택이나 구조화 메커니즘 미존재).
 * MVP: reasons[0] → whyRecommended (설계: LLM 가공이나 추출 메커니즘 미존재).
 * 향후 변경 시 이 함수만 수정하면 됨 (P-7).
 */
export function mapUIMessageToParts(parts: UIPartLike[]): ChatMessagePart[] {
  const result: ChatMessagePart[] = [];

  for (const part of parts) {
    // text 파트
    if (part.type === "text" && part.text !== undefined) {
      result.push({ type: "text", text: part.text });
      continue;
    }

    // search_beauty_data tool — output-available만 처리
    if (part.type === SEARCH_TOOL_TYPE && part.state === "output-available" && part.output) {
      const output = part.output as SearchToolOutput;
      if (output.error || !output.cards) continue;

      const domain = (part.input as { domain?: string })?.domain;

      for (const card of output.cards) {
        if (domain === "shopping") {
          const pc = card as ToolProductCard;
          result.push({
            type: "product-card",
            product: extractProduct(pc),
            brand: pc.brand ? { name: pc.brand.name } : null,
            store: pc.stores[0]
              ? { name: pc.stores[0].name, map_url: pc.stores[0].map_url }
              : null,
            whyRecommended: pc.reasons[0] ?? undefined,
          });
        } else if (domain === "treatment") {
          const tc = card as ToolTreatmentCard;
          result.push({
            type: "treatment-card",
            treatment: extractTreatment(tc),
            clinic: tc.clinics[0]
              ? { name: tc.clinics[0].name, booking_url: tc.clinics[0].booking_url ?? null }
              : null,
            whyRecommended: tc.reasons[0] ?? undefined,
          });
        }
      }
      continue;
    }

    // 그 외 tool 파트 (extract_user_profile, get_external_links 등) → 무시
  }

  return result;
}

/** tool output에서 Product 타입만 추출 (reasons, stores 등 확장 필드 제거) */
function extractProduct(card: ToolProductCard): Product {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    brand_id: card.brand_id,
    category: card.category,
    subcategory: card.subcategory,
    skin_types: card.skin_types,
    hair_types: card.hair_types,
    concerns: card.concerns,
    key_ingredients: card.key_ingredients,
    price: card.price,
    volume: card.volume,
    purchase_links: card.purchase_links,
    english_label: card.english_label,
    tourist_popular: card.tourist_popular,
    is_highlighted: card.is_highlighted,
    highlight_badge: card.highlight_badge,
    rating: card.rating,
    review_count: card.review_count,
    review_summary: card.review_summary,
    images: card.images,
    tags: card.tags,
    status: card.status,
    created_at: card.created_at,
    updated_at: card.updated_at,
  };
}

/** tool output에서 Treatment 타입만 추출 (reasons, clinics 등 확장 필드 제거) */
function extractTreatment(card: ToolTreatmentCard): Treatment {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    category: card.category,
    subcategory: card.subcategory,
    target_concerns: card.target_concerns,
    suitable_skin_types: card.suitable_skin_types,
    price_min: card.price_min,
    price_max: card.price_max,
    price_currency: card.price_currency,
    duration_minutes: card.duration_minutes,
    downtime_days: card.downtime_days,
    session_count: card.session_count,
    precautions: card.precautions,
    aftercare: card.aftercare,
    is_highlighted: card.is_highlighted,
    highlight_badge: card.highlight_badge,
    rating: card.rating,
    review_count: card.review_count,
    images: card.images,
    tags: card.tags,
    status: card.status,
    created_at: card.created_at,
    updated_at: card.updated_at,
  };
}
```

- [ ] **Step 4: 테스트 실행하여 전부 통과 확인**

Run: `npx vitest run src/client/features/chat/card-mapper.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add src/client/features/chat/card-mapper.ts src/client/features/chat/card-mapper.test.ts
git commit -m "feat(P2-51): card-mapper — tool-result → ChatMessagePart 변환"
```

---

## Task 3: MessageGroup 래퍼 컴포넌트

**Files:**
- Create: `src/client/features/chat/MessageGroup.tsx`

- [ ] **Step 6: MessageGroup.tsx 작성**

하나의 메시지(assistant 또는 user)의 파트들을 시각적으로 묶는 래퍼. assistant 메시지의 text 버블과 카드가 같은 응답 그룹임을 시각적으로 표현한다.

```typescript
"use client";

import "client-only";

import { cn } from "@/shared/utils/cn";

type MessageGroupProps = {
  role: "user" | "assistant";
  children: React.ReactNode;
};

/** 동일 메시지의 파트들을 시각적으로 묶는 래퍼 (user-screens §6.1) */
export default function MessageGroup({ role, children }: MessageGroupProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        role === "user" ? "items-end" : "items-start"
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 7: 커밋**

```bash
git add src/client/features/chat/MessageGroup.tsx
git commit -m "feat(P2-51): MessageGroup — 메시지 파트 시각적 그룹핑"
```

---

## Task 4: MessageList 파트별 분기 렌더링

**Files:**
- Modify: `src/client/features/chat/MessageList.tsx`

- [ ] **Step 8: MessageList.tsx를 파트 기반으로 리팩터링**

기존 `ChatMessage { content: string }` → `ChatMessage { parts: ChatMessagePart[] }` 변경. 파트 타입별로 MessageBubble 또는 카드 컴포넌트를 렌더링한다.

```typescript
"use client";

import "client-only";

import { useEffect, useRef } from "react";
import type { ChatMessagePart } from "./card-mapper";
import MessageBubble from "./MessageBubble";
import MessageGroup from "./MessageGroup";
import StreamingIndicator from "./StreamingIndicator";
import ProductCard from "@/client/features/cards/ProductCard";
import TreatmentCard from "@/client/features/cards/TreatmentCard";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatMessagePart[];
};

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  locale: string;
};

export default function MessageList({ messages, isStreaming, locale }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastPartsLength = messages[messages.length - 1]?.parts.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, lastPartsLength]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <MessageGroup key={msg.id} role={msg.role}>
            {msg.parts.map((part, idx) => (
              <MessagePart key={`${msg.id}-${idx}`} part={part} role={msg.role} locale={locale} />
            ))}
          </MessageGroup>
        ))}
        {isStreaming && <StreamingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** 파트 타입별 렌더링 분기 */
function MessagePart({
  part,
  role,
  locale,
}: {
  part: ChatMessagePart;
  role: "user" | "assistant";
  locale: string;
}) {
  switch (part.type) {
    case "text":
      return (
        <MessageBubble role={role}>
          {part.text}
        </MessageBubble>
      );
    case "product-card":
      return (
        <div className="w-full max-w-[85%]">
          <ProductCard
            product={part.product}
            brand={part.brand}
            store={part.store}
            whyRecommended={part.whyRecommended}
            locale={locale}
          />
        </div>
      );
    case "treatment-card":
      return (
        <div className="w-full max-w-[85%]">
          <TreatmentCard
            treatment={part.treatment}
            clinic={part.clinic}
            whyRecommended={part.whyRecommended}
            locale={locale}
          />
        </div>
      );
  }
}
```

- [ ] **Step 9: tsc 타입 검사**

Run: `npx tsc --noEmit`
Expected: No errors (MessageBubble.tsx는 `children: ReactNode`를 받으므로 변경 불필요)

- [ ] **Step 10: 커밋**

```bash
git add src/client/features/chat/MessageList.tsx
git commit -m "feat(P2-51): MessageList — 파트별 분기 렌더링 (text/product-card/treatment-card)"
```

---

## Task 5: ChatInterface에서 card-mapper 연결

**Files:**
- Modify: `src/client/features/chat/ChatInterface.tsx`

- [ ] **Step 11: ChatInterface.tsx에서 UIMessage.parts → card-mapper → MessageList 연결**

기존: `m.parts`에서 text만 추출하여 `content: string`으로 전달
변경: `m.parts`를 `mapUIMessageToParts()`로 변환하여 `parts: ChatMessagePart[]`로 전달

```typescript
"use client";

import "client-only";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { mapUIMessageToParts } from "./card-mapper";
import MessageList from "./MessageList";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import SuggestedQuestions from "./SuggestedQuestions";

type ChatInterfaceProps = {
  locale: string;
};

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const t = useTranslations("chat");
  const [showSuggestions, setShowSuggestions] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", credentials: "include" }),
    []
  );

  const { messages, status, error, sendMessage } = useChat({ transport });

  const isStreaming = status === "streaming" || status === "submitted";

  // 메시지가 전송되면 제안 질문 숨김
  useEffect(() => {
    if (messages.length > 0) setShowSuggestions(false);
  }, [messages.length]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  // UIMessage.parts → ChatMessagePart[] 변환
  const chatMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: mapUIMessageToParts(m.parts as Array<{ type: string; text?: string; state?: string; input?: { domain?: string }; output?: unknown }>),
  }));

  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              <MessageBubble role="assistant">
                {t("greeting")}
              </MessageBubble>
              {showSuggestions && (
                <SuggestedQuestions onSelect={handleSend} />
              )}
            </div>
          </div>
        ) : (
          <MessageList messages={chatMessages} isStreaming={isStreaming} locale={locale} />
        )}

        {error && (
          <div className="px-4 py-2">
            <p className="text-center text-xs text-destructive">
              {t("errorRetry")}
            </p>
          </div>
        )}

        <InputBar onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
```

- [ ] **Step 12: tsc 타입 검사**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 13: 커밋**

```bash
git add src/client/features/chat/ChatInterface.tsx
git commit -m "feat(P2-51): ChatInterface — card-mapper 연결, parts 기반 메시지 전달"
```

---

## Task 6: E2E 수동 검증 + 런타임 확인

**Files:** None (검증만)

- [ ] **Step 14: 런타임에서 AI SDK 파트 구조 확인**

`ChatInterface.tsx`의 chatMessages 생성 직전에 임시 `console.log`를 추가하여 실제 파트 구조 확인:

```typescript
// 임시 — 검증 후 삭제
if (messages.length > 0) {
  console.log("[P2-51 debug] parts:", JSON.stringify(messages[messages.length - 1].parts.map(p => ({ type: p.type, state: (p as { state?: string }).state })), null, 2));
}
```

Run: `npm run dev` → 브라우저에서 채팅 → 추천 요청 → 브라우저 콘솔에서 확인

Expected:
```json
[
  { "type": "step-start" },
  { "type": "tool-search_beauty_data", "state": "output-available" },
  { "type": "text" }
]
```

만약 `"type": "dynamic-tool"`이 나오면 card-mapper의 SEARCH_TOOL_TYPE 상수를 수정해야 함:
```typescript
// card-mapper.ts — dynamic-tool 대응 (필요 시)
const isSearchTool = (part: UIPartLike) =>
  part.type === "tool-search_beauty_data" ||
  (part.type === "dynamic-tool" && (part as { toolName?: string }).toolName === "search_beauty_data");
```

- [ ] **Step 15: console.log 삭제 + 최종 커밋**

임시 디버그 코드 삭제 후 최종 커밋.

```bash
git add src/client/features/chat/ChatInterface.tsx
git commit -m "feat(P2-51): 런타임 파트 구조 검증 완료"
```

---

## Task 7: tsc + 기존 테스트 회귀 검증

**Files:** None (검증만)

- [ ] **Step 16: 타입 검사**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 17: 전체 테스트**

Run: `npx vitest run`
Expected: All existing tests PASS + card-mapper tests PASS

- [ ] **Step 18: 최종 커밋 (필요 시)**

회귀 이슈 발견 시 수정 후 커밋.

---

## Verification Checklist (V-*)

```
✅ V-1  import 방향: client/ → shared/ DAG 준수. server/ import 없음
✅ V-2  core/ 미수정
✅ V-3  cross-domain 데이터: tool-result는 SSE로 수신, server 직접 호출 아님
✅ V-4  features 독립: chat/ → cards/ import는 user-screens §6.1 설계대로
✅ V-5  콜 스택 ≤ 4: ChatInterface → MessageList → ProductCard (3단계)
✅ V-6  바인딩 ≤ 4: ChatInterface → card-mapper → shared/types (shared 제외 = 1)
✅ V-7  beauty/ 미수정
✅ V-8  beauty/ 미수정
✅ V-9  중복 없음: 기존 카드 매핑 코드 미존재
✅ V-10 미사용 export 없음: mapUIMessageToParts + 타입만 export
✅ V-11 is_highlighted: 렌더링만 (카드 순서/필터 미사용)
✅ V-12 any 타입 없음: unknown + 타입 가드 패턴
✅ V-15 ui/ 순수성: client/ui/ 파일 변경 없음
✅ V-17 제거 안전성: card-mapper 삭제 시 chat/ 내부만 영향. core/, shared/ 무관
✅ V-24 수정 영향 분석: MessageBubble 변경 불필요 (children: ReactNode 유지)
```
