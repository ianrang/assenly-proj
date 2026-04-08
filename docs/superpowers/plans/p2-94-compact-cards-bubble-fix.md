# P2-94: 컴팩트 카드 + 말풍선 보정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추천 카드를 가로 스크롤 컴팩트 형태(160px)로 변환하고, 채팅 말풍선 크기를 일관성·논리성 있게 보정한다.

**Architecture:** 모든 수정은 `client/features/chat/`과 `client/features/cards/` 범위 내에서 완결. server/ 수정 0건. core/ 수정 0건. shared/ 수정 0건. 기존 card-mapper의 데이터 구조(ChatMessagePart 타입)는 변경하지 않으며, 렌더링 레이어만 수정한다.

**Tech Stack:** React 19, Tailwind CSS 4, AI SDK 6.x UIMessage

---

> 버전: 1.0
> 작성일: 2026-04-09
> 선행: P2-95 (히스토리 표시 ✅), P2-51 (카드 렌더링 ✅)
> 정본: user-screens.md §1.3~1.4 (카드 UI), CLAUDE.md S-* (디자인 시스템)

## 0. 범위 선언

### 이 계획이 다루는 것

| 작업 | 수정 파일 | 분류 |
|------|----------|------|
| 카드를 가로 스크롤 160px 컴팩트 형태로 변환 | `MessageList.tsx`, `ProductCard.tsx`, `TreatmentCard.tsx` | UI |
| 말풍선 max-width를 컨텐츠 크기에 맞게 보정 | `MessageBubble.tsx` | UI |
| 카드 영역과 말풍선의 정렬 일관성 보정 | `MessageList.tsx` | UI |

### 이 계획이 다루지 않는 것

- card-mapper.ts 데이터 구조 변경 (ChatMessagePart 타입 불변)
- server/ 코드 수정 (search-handler, prompts 등)
- KitCtaCard 레이아웃 (별도 CTA 패턴, 이번 범위 외)
- 다크 모드 디자인 토큰 변경 (기존 토큰 재사용)

### 파일 변경 맵

```
수정 파일 (4개):
  src/client/features/chat/MessageList.tsx      ← 카드 렌더링 분기 변경 (가로 스크롤 래퍼)
  src/client/features/chat/MessageBubble.tsx    ← 말풍선 max-width 보정
  src/client/features/cards/ProductCard.tsx     ← 컴팩트 variant 추가
  src/client/features/cards/TreatmentCard.tsx   ← 컴팩트 variant 추가

신규 파일: 없음
server/ 수정: 0건
core/ 수정: 0건
shared/ 수정: 0건
card-mapper.ts 수정: 0건
```

### 의존 방향 검증 (변경 후에도 동일)

```
MessageList.tsx ──→ MessageBubble.tsx    (client/features/chat/ 내부)
                ──→ ProductCard.tsx      (client/features/cards/ — 기존 의존)
                ──→ TreatmentCard.tsx    (client/features/cards/ — 기존 의존)
                ──→ card-mapper types    (client/features/chat/ 내부)
                ──→ shared/utils/cn      (shared/ 정방향)

ProductCard.tsx  ──→ shared/types/domain (shared/ 정방향, 기존)
                 ──→ shared/utils/*      (shared/ 정방향, 기존)
                 ──→ client/ui/primitives (client/ui/, 기존)

역방향·순환: 없음. 새 import 추가: 없음.
```

### 아키텍처 규칙 준수 검증

```
✅ P-1  DAG: client/features/ → client/ui/ → shared/ 정방향만
✅ R-1  client/ → server/ import 없음
✅ R-11 ui/ import 범위: shared/ ONLY (ProductCard/TreatmentCard는 features/, ui/ 아님)
✅ L-0b 경계 가드: 모든 파일에 "use client" + import "client-only"
✅ L-12 모바일 퍼스트: Tailwind 기본=모바일 유지
✅ S-5  하드코딩 금지: 기존 시맨틱 토큰 사용 (bg-card, border-border 등)
✅ S-9  모드 독립: dark: 접두사 사용 안 함, CSS 변수가 모드 흡수
✅ S-10 컴포넌트 자족: Tailwind + 디자인 토큰으로 완결
✅ G-3  패스스루 래퍼 금지: 새 래퍼 컴포넌트 없음
✅ G-4  미사용 코드 금지: 기존 풀사이즈 카드는 variant prop으로 유지 (상세 뷰에서 사용 가능)
```

---

## Phase 1: 카드 컴팩트화

### Task 1: ProductCard에 compact variant 추가

**Files:**
- Modify: `src/client/features/cards/ProductCard.tsx`

**설계:**
- `variant?: 'default' | 'compact'` prop 추가 (기본값 'default')
- compact: 폭 160px, 이미지 h-20(80px), 본문 간결화 (브랜드+이름+가격만)
- default: 현재 레이아웃 그대로 유지 (기존 호출부 영향 없음)
- tags, english_label, store, purchase_links, whyRecommended는 compact에서 숨김

- [ ] **Step 1: ProductCard에 variant prop 추가 + compact 렌더링**

`ProductCard.tsx` 수정:

```tsx
type ProductCardProps = {
  product: Product;
  brand?: { name: LocalizedText } | null;
  store?: { name: LocalizedText; map_url?: string } | null;
  whyRecommended?: string;
  locale: string;
  variant?: 'default' | 'compact';
};

export default function ProductCard({ product, brand, store, whyRecommended, locale, variant = 'default' }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = product.images[0];
  const showImage = imgSrc && !imgError;
  const isHighlighted = product.is_highlighted && product.highlight_badge !== null;
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <article
        className={cn(
          "w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-card",
          isHighlighted ? "border-primary" : "border-border"
        )}
      >
        <div className="relative flex h-20 items-center justify-center bg-surface-warm">
          {showImage ? (
            <img
              src={imgSrc}
              alt={localized(product.name, locale)}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">Image</span>
          )}
          {isHighlighted && (
            <div className="absolute left-1.5 top-1.5">
              <HighlightBadge isHighlighted={product.is_highlighted} badge={product.highlight_badge} locale={locale} />
            </div>
          )}
        </div>
        <div className="p-2">
          {brand && (
            <p className="truncate text-[10px] text-muted-foreground">{localized(brand.name, locale)}</p>
          )}
          <p className="truncate text-xs font-semibold text-foreground">{localized(product.name, locale)}</p>
          {product.price !== null && (
            <p className="text-xs font-bold text-primary">{formatPrice(product.price)}</p>
          )}
        </div>
      </article>
    );
  }

  // default variant — 기존 코드 그대로
  return (
    <article ... > {/* 기존 코드 불변 */}
    </article>
  );
}
```

핵심:
- `w-40` = 160px 고정 폭
- `shrink-0 snap-start` = 가로 스크롤 내 고정 + 스냅
- `h-20` = 80px 이미지
- `p-2` = 압축된 패딩
- `truncate` = 1줄 말줄임
- 시맨틱 토큰만 사용 (S-5): `bg-card`, `border-border`, `bg-surface-warm`, `text-primary` 등

- [ ] **Step 2: 기존 테스트 통과 확인**

Run: `npx vitest run src/client/features/cards/ProductCard.test.tsx`
Expected: 기존 테스트 PASS (variant 기본값 'default'로 기존 동작 불변)

- [ ] **Step 3: 커밋**

```bash
git add src/client/features/cards/ProductCard.tsx
git commit -m "feat(P2-94): ProductCard compact variant 추가 (160px 가로 스크롤용)"
```

---

### Task 2: TreatmentCard에 compact variant 추가

**Files:**
- Modify: `src/client/features/cards/TreatmentCard.tsx`

**설계:**
- `variant?: 'default' | 'compact'` prop 추가 (기본값 'default')
- compact: 폭 160px, 이미지 없음(시술은 텍스트 기반), 카테고리+이름+가격 범위만
- tags, whyRecommended, clinic, downtime warning은 compact에서 숨김
- duration + downtime은 1줄 요약으로 표시

- [ ] **Step 1: TreatmentCard에 variant prop 추가 + compact 렌더링**

`TreatmentCard.tsx` 수정:

```tsx
type TreatmentCardProps = {
  treatment: Treatment;
  clinic?: { name: LocalizedText; booking_url?: string | null } | null;
  whyRecommended?: string;
  stayDays?: number | null;
  locale: string;
  variant?: 'default' | 'compact';
};

export default function TreatmentCard({ treatment, clinic, whyRecommended, stayDays, locale, variant = 'default' }: TreatmentCardProps) {
  const isHighlighted = treatment.is_highlighted && treatment.highlight_badge !== null;
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <article
        className={cn(
          "w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-card p-2.5",
          isHighlighted ? "border-primary" : "border-border"
        )}
      >
        <div className="mb-1 flex items-start justify-between gap-1">
          {treatment.category && (
            <span className="truncate rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {treatment.category}
            </span>
          )}
          {isHighlighted && (
            <HighlightBadge isHighlighted={treatment.is_highlighted} badge={treatment.highlight_badge} locale={locale} />
          )}
        </div>
        <p className="truncate text-xs font-semibold text-foreground">{localized(treatment.name, locale)}</p>
        {(treatment.price_min !== null || treatment.price_max !== null) && (
          <p className="text-xs font-bold text-primary">{formatPriceRange(treatment.price_min, treatment.price_max)}</p>
        )}
        {treatment.duration_minutes && (
          <p className="mt-1 text-[10px] text-muted-foreground">{treatment.duration_minutes}min{treatment.downtime_days !== null && treatment.downtime_days > 0 ? ` · ${treatment.downtime_days}d rec.` : ''}</p>
        )}
      </article>
    );
  }

  // default variant — 기존 코드 그대로 (downtimeWarning 계산 포함)
  const downtimeWarning = stayDays !== null && stayDays !== undefined && treatment.downtime_days !== null && treatment.downtime_days > 0
    ? treatment.downtime_days >= stayDays * 0.5
    : false;

  return (
    <article ... > {/* 기존 코드 불변 */}
    </article>
  );
}
```

핵심:
- `w-40 shrink-0 snap-start` = ProductCard와 동일 레이아웃 규칙
- 이미지 영역 없음 (시술 카드 특성)
- duration + downtime 1줄 요약: "30min · 2d rec."
- downtimeWarning 연산은 compact에서 생략 (stayDays prop이 null이므로)

- [ ] **Step 2: 커밋**

```bash
git add src/client/features/cards/TreatmentCard.tsx
git commit -m "feat(P2-94): TreatmentCard compact variant 추가 (160px 가로 스크롤용)"
```

---

## Phase 2: MessageList 가로 스크롤 적용

### Task 3: MessageList에서 카드를 가로 스크롤 그룹으로 렌더

**Files:**
- Modify: `src/client/features/chat/MessageList.tsx:57-108` (MessagePart 함수 → 카드 그룹화)

**설계:**
- 현재: 메시지의 parts를 순회하며 각 part를 개별 렌더 (text → MessageBubble, card → 세로 나열)
- 변경: 연속된 카드 파트를 그룹화하여 `<div className="flex gap-2 overflow-x-auto snap-x">` 래퍼로 묶기
- 카드 파트 = `product-card` | `treatment-card` | `kit-cta-card`
- 텍스트 파트는 기존 MessageBubble 그대로
- 카드 그룹 안에서는 compact variant 사용

**핵심 알고리즘:**
```
parts = [text, product, product, product, text]
→ 그룹화: [text], [product, product, product], [text]
→ 렌더: MessageBubble, CardStrip(3 compact cards), MessageBubble
```

- [ ] **Step 1: MessageList.tsx의 MessagePart 교체 + 카드 그룹화 로직**

`MessageList.tsx` 수정 — 메시지 parts 렌더링 로직 변경:

```tsx
export default function MessageList({ messages, isStreaming, locale }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const lastPartsLength = messages[messages.length - 1]?.parts.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, lastPartsLength]);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageGroup key={msg.id} role={msg.role}>
              <GroupedParts parts={msg.parts} role={msg.role} locale={locale} onKitClaim={() => setSheetOpen(true)} />
            </MessageGroup>
          ))}
          {isStreaming && <StreamingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>
      <KitCtaSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

/** 연속 카드 파트를 가로 스크롤 그룹으로 묶어 렌더 */
function GroupedParts({
  parts,
  role,
  locale,
  onKitClaim,
}: {
  parts: ChatMessagePart[];
  role: "user" | "assistant";
  locale: string;
  onKitClaim: () => void;
}) {
  const groups = groupParts(parts);

  return (
    <>
      {groups.map((group, gi) => {
        if (group.type === 'text') {
          return <MessageBubble key={gi} role={role}>{group.part.text}</MessageBubble>;
        }
        if (group.type === 'cards') {
          return (
            <div key={gi} className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin">
              {group.cards.map((card, ci) => (
                <CardPart key={ci} part={card} locale={locale} onKitClaim={onKitClaim} />
              ))}
            </div>
          );
        }
        // standalone (kit-cta-card 등)
        return (
          <div key={gi} className="w-full max-w-[85%]">
            <StandalonePart part={group.part} locale={locale} onKitClaim={onKitClaim} />
          </div>
        );
      })}
    </>
  );
}

/** 가로 스크롤 대상 카드 타입 (kit-cta-card 제외 — CTA는 전체 폭) */
const SCROLL_CARD_TYPES = ['product-card', 'treatment-card'] as const;

function isScrollCard(part: ChatMessagePart): boolean {
  return (SCROLL_CARD_TYPES as readonly string[]).includes(part.type);
}

type PartGroup =
  | { type: 'text'; part: { type: 'text'; text: string } }
  | { type: 'cards'; cards: ChatMessagePart[] }
  | { type: 'standalone'; part: ChatMessagePart };

/** parts 배열에서 연속 product/treatment 카드를 그룹화. kit-cta는 standalone. */
function groupParts(parts: ChatMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let cardBuffer: ChatMessagePart[] = [];

  function flushCards() {
    if (cardBuffer.length > 0) {
      groups.push({ type: 'cards', cards: [...cardBuffer] });
      cardBuffer = [];
    }
  }

  for (const part of parts) {
    if (part.type === 'text') {
      flushCards();
      groups.push({ type: 'text', part });
    } else if (isScrollCard(part)) {
      cardBuffer.push(part);
    } else {
      // kit-cta-card 등 — 전체 폭 standalone
      flushCards();
      groups.push({ type: 'standalone', part });
    }
  }
  flushCards();

  return groups;
}

/** 가로 스크롤 내 개별 카드. compact variant. */
function CardPart({
  part,
  locale,
  onKitClaim,
}: {
  part: ChatMessagePart;
  locale: string;
  onKitClaim: () => void;
}) {
  switch (part.type) {
    case 'product-card':
      return (
        <ProductCard
          product={part.product}
          brand={part.brand}
          store={part.store}
          whyRecommended={part.whyRecommended}
          locale={locale}
          variant="compact"
        />
      );
    case 'treatment-card':
      return (
        <TreatmentCard
          treatment={part.treatment}
          clinic={part.clinic}
          whyRecommended={part.whyRecommended}
          stayDays={null}
          locale={locale}
          variant="compact"
        />
      );
    default:
      return null;
  }
}

/** 전체 폭 standalone 카드 (kit-cta-card 등). */
function StandalonePart({
  part,
  locale,
  onKitClaim,
}: {
  part: ChatMessagePart;
  locale: string;
  onKitClaim: () => void;
}) {
  if (part.type === 'kit-cta-card') {
    return (
      <KitCtaCard
        productName={part.productName}
        highlightBadge={part.highlightBadge}
        locale={locale}
        onClaim={onKitClaim}
      />
    );
  }
  return null;
}
```

변경 핵심:
- `MessagePart` 함수 제거 → `GroupedParts` + `CardPart`로 교체
- `groupParts()` 순수 함수: 연속 카드를 1개 그룹으로 묶음
- 가로 스크롤 컨테이너: `flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-thin`
- `KitCtaCard`는 가로 스크롤에 포함하지 않음 (CTA는 전체 폭이 적절)

- [ ] **Step 2: 개발 서버에서 시각 확인**

Run: `npm run dev`
1. 채팅에서 제품 추천 요청 → 카드가 가로 스크롤로 나오는지 확인
2. 카드 스와이프가 자연스러운지 확인 (snap)
3. 텍스트 → 카드 → 텍스트 흐름이 자연스러운지 확인

- [ ] **Step 3: 커밋**

```bash
git add src/client/features/chat/MessageList.tsx
git commit -m "feat(P2-94): 카드 가로 스크롤 그룹 렌더 + compact variant 적용"
```

---

## Phase 3: 말풍선 보정

### Task 4: MessageBubble max-width를 컨텐츠 적응형으로 보정

**Files:**
- Modify: `src/client/features/chat/MessageBubble.tsx`

**현재 문제:**
- `max-w-[80%]` 고정 → 짧은 텍스트("Hi!")도 여백이 과도
- AI 말풍선과 User 말풍선 스타일이 비대칭이지만 의도적 (역할 구분)
- 말풍선 크기가 텍스트 길이에 무관하게 일정 → 비자연적

**수정 방향:**
- `max-w-[80%]`는 유지 (긴 텍스트가 화면을 넘지 않도록)
- `w-fit` 추가 → 컨텐츠에 맞게 축소 (짧은 텍스트는 좁게)
- 이렇게 하면 짧은 메시지는 컴팩트하고, 긴 메시지는 80%까지 확장

- [ ] **Step 1: MessageBubble에 w-fit 추가**

`MessageBubble.tsx:18-19` 수정:

```tsx
      <div
        className={cn(
          "w-fit max-w-[80%] rounded-md px-3.5 py-2.5 text-sm leading-normal",
          isUser
            ? "rounded-br-[4px] bg-primary text-primary-foreground"
            : "rounded-bl-[4px] border border-border-warm bg-surface-warm text-foreground"
        )}
      >
```

변경점: `max-w-[80%]` 앞에 `w-fit` 추가.
- `w-fit`: 컨텐츠 폭에 맞게 축소
- `max-w-[80%]`: 긴 텍스트의 상한 유지
- 기존 패딩/둥근 모서리/색상 불변

- [ ] **Step 2: 커밋**

```bash
git add src/client/features/chat/MessageBubble.tsx
git commit -m "fix(P2-94): 말풍선 w-fit 추가 — 컨텐츠 크기 적응형 보정"
```

---

## Phase 4: 최종 검증

### Task 5: 전체 테스트 + 타입 체크

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run src/client/`
Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0건

- [ ] **Step 3: 개발 서버 E2E 확인**

Run: `npm run dev`
체크리스트:
- [ ] 제품 추천 → 가로 스크롤 카드 (160px, snap)
- [ ] 시술 추천 → 가로 스크롤 카드 (160px, snap)
- [ ] 카드 2.1장 이상 화면에 보임
- [ ] 텍스트 → 카드 → 텍스트 자연 흐름
- [ ] 짧은 말풍선 ("Hi!") → 컴팩트 크기
- [ ] 긴 말풍선 → 80% 상한 유지
- [ ] AI/User 말풍선 좌/우 정렬 유지
- [ ] 스크롤 indicator (snap) 동작

- [ ] **Step 4: 커밋 (TODO 갱신)**

```bash
git add TODO.md
git commit -m "chore(P2-94): TODO 진행률 갱신"
```

---

## 자기 검증 체크리스트

### 아키텍처 (CLAUDE.md)

```
✅ V-1  의존성 방향: client/ → shared/ 정방향만. 새 import 추가 없음
✅ V-2  core 불변: core/ 수정 0건
✅ V-15 ui/ 순수성: client/ui/ 수정 0건. ProductCard/TreatmentCard는 features/cards/
✅ V-13 디자인 토큰: #hex 하드코딩 없음. bg-card, border-border 등 시맨틱 토큰만
✅ V-14 토큰 동기화: 새 CSS 변수 추가 없음 (기존 토큰 재사용)
✅ L-0b 경계 가드: 모든 client/ 파일에 "use client" + import "client-only"
✅ L-12 모바일 퍼스트: Tailwind 기본=모바일. md:/lg: 접두사 미사용
✅ S-5  하드코딩 금지: 시맨틱 토큰만
✅ S-9  모드 독립: dark: 접두사 불필요 (CSS 변수가 모드 흡수)
✅ S-10 컴포넌트 자족: 외부 CSS 의존 없음
```

### 코드 품질

```
✅ G-1  기존 코드 분석 완료
✅ G-2  중복 없음 (variant prop으로 기존 코드 재사용)
✅ G-3  패스스루 래퍼 없음
✅ G-4  미사용 코드 없음 (default variant 유지)
✅ G-5  기존 패턴 (cn() 유틸, Tailwind 클래스, localized() 등)
✅ G-8  any 타입 없음
✅ Q-5  컴포넌트 ≤ 200줄
```

### 독립성/확장성

```
✅ variant prop 기본값 'default' → 기존 호출부 영향 없음
✅ groupParts() 순수 함수 → 테스트 가능, 데이터 구조 무관
✅ 새 도메인(DOM-3~5) 카드 추가 시 variant prop만 적용하면 됨
✅ card-mapper.ts 불변 → 서버 tool 결과 구조 무관
```
