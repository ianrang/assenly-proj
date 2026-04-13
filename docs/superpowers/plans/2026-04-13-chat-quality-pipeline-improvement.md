# 채팅 품질 파이프라인 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 응답 방어, store/clinic 검색 품질 개선, 프롬프트 튜닝으로 eval 17/20 → 20/20 목표

**Architecture:** 기존 SSE 스트리밍 파이프라인 유지. 클라이언트 빈 응답 감지 + 자동 1회 재시도. store/clinic에 beauty judgment(scoring + reasons) 파이프라인 추가. 프롬프트 few-shot 보강.

**Tech Stack:** AI SDK 6.x (useChat, streamText), Supabase (RPC, pgvector), Vitest

---

## File Structure

### 신규 파일
| 파일 | 책임 |
|------|------|
| `src/server/features/beauty/store.ts` | Store scoring — english_support, tourist_services, rating 기반 점수 + reasons 생성 |
| `src/server/features/beauty/store.test.ts` | scoreStores 단위 테스트 |
| `src/server/features/beauty/clinic.ts` | Clinic scoring — english_support, foreigner_friendly, license_verified 기반 점수 + reasons 생성 |
| `src/server/features/beauty/clinic.test.ts` | scoreClinics 단위 테스트 |
| `supabase/migrations/013_match_stores_clinics.sql` | match_stores, match_clinics RPC (벡터 검색) |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/server/features/repositories/store-repository.ts` | matchStoresByVector 함수 추가 |
| `src/server/features/repositories/clinic-repository.ts` | matchClinicsByVector 함수 추가 |
| `src/server/features/chat/tools/search-handler.ts` | searchStore/searchClinic에 벡터 검색 + scoring + rank 파이프라인 적용 |
| `src/client/features/chat/ChatContent.tsx` | 빈 응답 감지 + 자동 1회 regenerate |
| `src/server/features/api/routes/chat.ts` | 서버 onFinish에서 빈 응답 DB 저장 스킵 |
| `src/server/features/chat/prompts.ts` | domain guide 수정 + "Answer first" 강화 + 빈 응답 방지 지시 |
| `src/server/features/chat/prompt-examples.ts` | few-shot 예시 3개 추가 (store context, combination skin, no-profile generic) |
| `scripts/fixtures/eval-scenarios.json` | 테스트 시나리오 확장 (store/clinic/multi-domain) |

---

## Task 1: 빈 응답 클라이언트 방어

**Files:**
- Modify: `src/client/features/chat/ChatContent.tsx`

- [ ] **Step 1: ChatContent.tsx에 빈 응답 감지 + 자동 재시도 추가**

```typescript
// ChatContent.tsx — 변경 부분만

// 기존 import 아래에 추가 (새 import 없음, useRef는 이미 import됨)

// 기존 코드:
// const conversationIdRef = useRef<string | null>(initialConversationId);
// 아래에 추가:
const retryCountRef = useRef(0);

// 기존 handleSend 함수를 수정:
function handleSend(text: string) {
  setShowSuggestions(false);
  retryCountRef.current = 0; // 새 메시지 전송 시 재시도 카운터 리셋
  sendMessage({ text });
}

// useChat의 onFinish를 수정:
onFinish: ({ message }) => {
  // P2-50b: messageMetadata에서 conversationId 추출
  const meta = message.metadata as
    | { conversationId?: string }
    | undefined;
  if (meta?.conversationId && !conversationIdRef.current) {
    setConversationId(meta.conversationId);
  }

  // 빈 응답 감지 + 자동 1회 재시도
  const hasText = message.parts?.some(
    (p: { type: string; text?: string }) =>
      p.type === 'text' && typeof p.text === 'string' && p.text.trim() !== ''
  );
  if (!hasText && retryCountRef.current < 1) {
    retryCountRef.current += 1;
    regenerate();
    return;
  }
  retryCountRef.current = 0;
},
```

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add src/client/features/chat/ChatContent.tsx
git commit -m "fix: 빈 응답 클라이언트 감지 + 자동 1회 재시도"
```

---

## Task 2: 빈 응답 서버 방어 (DB 저장 스킵)

**Files:**
- Modify: `src/server/features/api/routes/chat.ts`

- [ ] **Step 1: onFinish에서 빈 응답 시 DB 저장 스킵**

`chat.ts`의 onFinish 콜백 시작 부분 (L300 `try {` 직후)에 추가:

```typescript
onFinish: async ({ messages: finalMessages }) => {
  try {
    // 빈 응답 방어: assistant 텍스트가 없으면 DB 저장 스킵
    // regenerate() 후 성공 응답이 오면 그때 정상 저장됨
    const lastMsg = finalMessages[finalMessages.length - 1];
    const hasAssistantText = lastMsg?.role === 'assistant' &&
      Array.isArray(lastMsg.parts) &&
      lastMsg.parts.some(
        (p: { type: string; text?: string }) =>
          p.type === 'text' && typeof p.text === 'string' && p.text.trim() !== ''
      );
    if (!hasAssistantText) {
      console.warn('[chat/onFinish] empty assistant response — skip DB save');
      return;
    }

    // ... 기존 저장 로직 (LLM_USAGE 로그 ~ extraction 저장)
```

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/api/routes/chat.ts
git commit -m "fix: 빈 응답 시 DB 저장 스킵 — regenerate 후 성공 시 정상 저장"
```

---

## Task 3: Store scoring 순수 함수

**Files:**
- Create: `src/server/features/beauty/store.ts`
- Create: `src/server/features/beauty/store.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/server/features/beauty/store.test.ts
import { describe, it, expect } from 'vitest';
import { scoreStores } from './store';
import type { Store } from '@/shared/types/domain';

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    name: { en: 'Test Store', ko: '테스트 매장' },
    description: null,
    country: 'KR', city: 'Seoul', district: 'Gangnam',
    location: null, address: null, operating_hours: null,
    english_support: 'none',
    store_type: null,
    tourist_services: [],
    payment_methods: [],
    nearby_landmarks: [],
    external_links: [],
    is_highlighted: false, highlight_badge: null,
    rating: null, review_count: 0,
    images: [], tags: [],
    status: 'active', created_at: '', updated_at: '',
    ...overrides,
  } as Store;
}

describe('scoreStores', () => {
  it('gives higher score for fluent english support', () => {
    const stores = [
      makeStore({ id: 's1', english_support: 'none' }),
      makeStore({ id: 's2', english_support: 'fluent' }),
    ];
    const scored = scoreStores(stores);
    const s1 = scored.find(s => s.id === 's1')!;
    const s2 = scored.find(s => s.id === 's2')!;
    expect(s2.score).toBeGreaterThan(s1.score);
    expect(s2.reasons).toContain('Fluent English support');
  });

  it('adds reason for tourist services', () => {
    const stores = [
      makeStore({ id: 's1', tourist_services: ['tax_refund', 'beauty_consultation'] }),
    ];
    const scored = scoreStores(stores);
    expect(scored[0].reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('adds reason for high rating', () => {
    const stores = [
      makeStore({ id: 's1', rating: 4.5 }),
    ];
    const scored = scoreStores(stores);
    expect(scored[0].reasons).toContain('Highly rated (4.5)');
  });

  it('returns all stores (no exclusion)', () => {
    const stores = [
      makeStore({ id: 's1' }),
      makeStore({ id: 's2' }),
    ];
    const scored = scoreStores(stores);
    expect(scored).toHaveLength(2);
  });

  it('preserves is_highlighted', () => {
    const stores = [makeStore({ id: 's1', is_highlighted: true })];
    const scored = scoreStores(stores);
    expect(scored[0].is_highlighted).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/features/beauty/store.test.ts`
Expected: FAIL — `scoreStores` not found

- [ ] **Step 3: scoreStores 구현**

```typescript
// src/server/features/beauty/store.ts
import 'server-only';
import type { Store } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';

// ============================================================
// 매장 도메인 로직 — search-engine.md §3.2 확장
// 외국인 여행객 접근성 기반 점수 + reasons 생성.
// §2.3: store.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreStores).
// ============================================================

const BASE_SCORE = 0.5;

const ENGLISH_SUPPORT_BONUS: Record<string, number> = {
  fluent: 0.2,
  good: 0.15,
  basic: 0.05,
  none: 0,
};

const ENGLISH_SUPPORT_LABEL: Record<string, string> = {
  fluent: 'Fluent English support',
  good: 'Good English support',
  basic: 'Basic English available',
};

const TOURIST_SERVICE_LABELS: Record<string, string> = {
  tax_refund: 'Tax refund available',
  beauty_consultation: 'Beauty consultation service',
  multilingual_staff: 'Multilingual staff',
  product_samples: 'Free product samples',
};

const HIGH_RATING_THRESHOLD = 4.0;
const RATING_BONUS = 0.1;

/**
 * Store[]에 여행객 접근성 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 */
export function scoreStores(stores: Store[]): ScoredItem[] {
  return stores.map((store) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    // 영어 지원 수준
    const engBonus = ENGLISH_SUPPORT_BONUS[store.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[store.english_support];
    if (engLabel) reasons.push(engLabel);

    // 관광객 서비스
    for (const svc of store.tourist_services) {
      const label = TOURIST_SERVICE_LABELS[svc];
      if (label) reasons.push(label);
    }

    // 평점
    if (store.rating != null && store.rating >= HIGH_RATING_THRESHOLD) {
      score += RATING_BONUS;
      reasons.push(`Highly rated (${store.rating})`);
    }

    return {
      id: store.id,
      score: Math.max(0, Math.min(1, score)),
      reasons,
      warnings: [],
      is_highlighted: store.is_highlighted,
    };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/server/features/beauty/store.test.ts`
Expected: 5 passed

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/beauty/store.ts src/server/features/beauty/store.test.ts
git commit -m "feat: scoreStores 순수 함수 — 여행객 접근성 기반 scoring"
```

---

## Task 4: Clinic scoring 순수 함수

**Files:**
- Create: `src/server/features/beauty/clinic.ts`
- Create: `src/server/features/beauty/clinic.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/server/features/beauty/clinic.test.ts
import { describe, it, expect } from 'vitest';
import { scoreClinics } from './clinic';
import type { Clinic } from '@/shared/types/domain';

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'clinic-1',
    name: { en: 'Test Clinic', ko: '테스트 클리닉' },
    description: null,
    country: 'KR', city: 'Seoul', district: 'Gangnam',
    location: null, address: null, operating_hours: null,
    english_support: 'none',
    clinic_type: null,
    license_verified: false,
    consultation_type: [],
    foreigner_friendly: null,
    booking_url: null,
    external_links: [],
    is_highlighted: false, highlight_badge: null,
    rating: null, review_count: 0,
    images: [], tags: [],
    status: 'active', created_at: '', updated_at: '',
    ...overrides,
  } as Clinic;
}

describe('scoreClinics', () => {
  it('gives higher score for fluent english support', () => {
    const clinics = [
      makeClinic({ id: 'c1', english_support: 'none' }),
      makeClinic({ id: 'c2', english_support: 'fluent' }),
    ];
    const scored = scoreClinics(clinics);
    expect(scored.find(c => c.id === 'c2')!.score)
      .toBeGreaterThan(scored.find(c => c.id === 'c1')!.score);
  });

  it('adds reason for license verified', () => {
    const scored = scoreClinics([makeClinic({ license_verified: true })]);
    expect(scored[0].reasons).toContain('Licensed and verified clinic');
  });

  it('adds reason for foreigner friendly with interpreter', () => {
    const scored = scoreClinics([
      makeClinic({
        foreigner_friendly: {
          languages: ['en', 'ja'],
          interpreter: true,
          international_patients: true,
        },
      }),
    ]);
    expect(scored[0].reasons.some(r => r.includes('Interpreter'))).toBe(true);
  });

  it('adds reason for online booking', () => {
    const scored = scoreClinics([
      makeClinic({ booking_url: 'https://example.com/book' }),
    ]);
    expect(scored[0].reasons).toContain('Online booking available');
  });

  it('preserves is_highlighted', () => {
    const scored = scoreClinics([makeClinic({ is_highlighted: true })]);
    expect(scored[0].is_highlighted).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/features/beauty/clinic.test.ts`
Expected: FAIL

- [ ] **Step 3: scoreClinics 구현**

```typescript
// src/server/features/beauty/clinic.ts
import 'server-only';
import type { Clinic } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';

// ============================================================
// 클리닉 도메인 로직 — search-engine.md §3.2 확장
// 외국인 접근성 + 신뢰도 기반 점수 + reasons 생성.
// §2.3: clinic.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreClinics).
// ============================================================

const BASE_SCORE = 0.5;

const ENGLISH_SUPPORT_BONUS: Record<string, number> = {
  fluent: 0.2,
  good: 0.15,
  basic: 0.05,
  none: 0,
};

const ENGLISH_SUPPORT_LABEL: Record<string, string> = {
  fluent: 'Fluent English support',
  good: 'Good English support',
  basic: 'Basic English available',
};

const LICENSE_BONUS = 0.1;
const BOOKING_BONUS = 0.05;
const FOREIGNER_BONUS = 0.1;
const HIGH_RATING_THRESHOLD = 4.0;
const RATING_BONUS = 0.1;

/**
 * Clinic[]에 외국인 접근성 + 신뢰도 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 */
export function scoreClinics(clinics: Clinic[]): ScoredItem[] {
  return clinics.map((clinic) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    // 영어 지원 수준
    const engBonus = ENGLISH_SUPPORT_BONUS[clinic.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[clinic.english_support];
    if (engLabel) reasons.push(engLabel);

    // 면허 인증
    if (clinic.license_verified) {
      score += LICENSE_BONUS;
      reasons.push('Licensed and verified clinic');
    }

    // 외국인 친화
    if (clinic.foreigner_friendly) {
      const ff = clinic.foreigner_friendly;
      if (ff.interpreter) {
        score += FOREIGNER_BONUS;
        reasons.push('Interpreter service available');
      }
      if (ff.languages && ff.languages.length > 1) {
        reasons.push(`Supports ${ff.languages.length} languages`);
      }
    }

    // 온라인 예약
    if (clinic.booking_url) {
      score += BOOKING_BONUS;
      reasons.push('Online booking available');
    }

    // 평점
    if (clinic.rating != null && clinic.rating >= HIGH_RATING_THRESHOLD) {
      score += RATING_BONUS;
      reasons.push(`Highly rated (${clinic.rating})`);
    }

    return {
      id: clinic.id,
      score: Math.max(0, Math.min(1, score)),
      reasons,
      warnings: [],
      is_highlighted: clinic.is_highlighted,
    };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/server/features/beauty/clinic.test.ts`
Expected: 5 passed

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/beauty/clinic.ts src/server/features/beauty/clinic.test.ts
git commit -m "feat: scoreClinics 순수 함수 — 외국인 접근성 + 신뢰도 기반 scoring"
```

---

## Task 5: match_stores / match_clinics RPC 마이그레이션

**Files:**
- Create: `supabase/migrations/013_match_stores_clinics.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

기존 `012_expand_rpc_columns.sql`의 `match_products` 패턴을 따라 작성:

```sql
-- 013_match_stores_clinics.sql
-- Store/Clinic 벡터 검색 RPC — search-engine.md §2.1 확장
-- 기존 match_products/match_treatments 패턴 동일. cosine distance 기반 유사도 검색.

-- ============================================================
-- match_stores: 벡터 유사도 + 필터 검색
-- ============================================================
CREATE OR REPLACE FUNCTION match_stores(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_store_type text DEFAULT NULL,
  filter_english_support text DEFAULT NULL,
  filter_district text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  country text,
  city text,
  district text,
  location jsonb,
  address jsonb,
  operating_hours jsonb,
  english_support text,
  store_type text,
  tourist_services text[],
  payment_methods text[],
  nearby_landmarks text[],
  external_links jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.description,
    s.country, s.city, s.district,
    s.location::jsonb, s.address,
    s.operating_hours,
    s.english_support, s.store_type,
    s.tourist_services, s.payment_methods,
    s.nearby_landmarks, s.external_links,
    s.is_highlighted, s.highlight_badge,
    s.rating::float, s.review_count,
    s.images, s.tags,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM stores s
  WHERE s.status = 'active'
    AND s.embedding IS NOT NULL
    AND (filter_store_type IS NULL OR s.store_type = filter_store_type)
    AND (filter_english_support IS NULL OR s.english_support = filter_english_support)
    AND (filter_district IS NULL OR s.district = filter_district)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- match_clinics: 벡터 유사도 + 필터 검색
-- ============================================================
CREATE OR REPLACE FUNCTION match_clinics(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_clinic_type text DEFAULT NULL,
  filter_english_support text DEFAULT NULL,
  filter_district text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  country text,
  city text,
  district text,
  location jsonb,
  address jsonb,
  operating_hours jsonb,
  english_support text,
  clinic_type text,
  license_verified boolean,
  consultation_type text[],
  foreigner_friendly jsonb,
  booking_url text,
  external_links jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.name, c.description,
    c.country, c.city, c.district,
    c.location::jsonb, c.address,
    c.operating_hours,
    c.english_support, c.clinic_type,
    c.license_verified, c.consultation_type,
    c.foreigner_friendly::jsonb, c.booking_url,
    c.external_links,
    c.is_highlighted, c.highlight_badge,
    c.rating::float, c.review_count,
    c.images, c.tags,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM clinics c
  WHERE c.status = 'active'
    AND c.embedding IS NOT NULL
    AND (filter_clinic_type IS NULL OR c.clinic_type = filter_clinic_type)
    AND (filter_english_support IS NULL OR c.english_support = filter_english_support)
    AND (filter_district IS NULL OR c.district = filter_district)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: 로컬 DB에 마이그레이션 적용**

Run: `npx supabase db push --local`
Expected: `Applied migration 013_match_stores_clinics.sql`

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/013_match_stores_clinics.sql
git commit -m "feat: match_stores/match_clinics RPC — 벡터 검색 지원"
```

---

## Task 6: Repository에 벡터 검색 함수 추가

**Files:**
- Modify: `src/server/features/repositories/store-repository.ts`
- Modify: `src/server/features/repositories/clinic-repository.ts`

- [ ] **Step 1: store-repository.ts에 matchStoresByVector 추가**

파일 끝 (`findAllStores` 함수 아래)에 추가:

```typescript
/**
 * AI tool용 벡터 유사도 검색.
 * search-engine.md §2.1 matchByVector: match_stores RPC 호출.
 */
export async function matchStoresByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: StoreFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_stores', {
    query_embedding: embedding,
    match_count: limit,
    filter_store_type: filters.store_type ?? null,
    filter_english_support: filters.english_support ?? null,
    filter_district: filters.district ?? null,
  });

  if (error) {
    throw new Error('Store vector search failed');
  }

  return data ?? [];
}
```

- [ ] **Step 2: clinic-repository.ts에 matchClinicsByVector 추가**

파일 끝에 추가:

```typescript
/**
 * AI tool용 벡터 유사도 검색.
 * search-engine.md §2.1 matchByVector: match_clinics RPC 호출.
 */
export async function matchClinicsByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: ClinicFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_clinics', {
    query_embedding: embedding,
    match_count: limit,
    filter_clinic_type: filters.clinic_type ?? null,
    filter_english_support: filters.english_support ?? null,
    filter_district: filters.district ?? null,
  });

  if (error) {
    throw new Error('Clinic vector search failed');
  }

  return data ?? [];
}
```

- [ ] **Step 3: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 커밋**

```bash
git add src/server/features/repositories/store-repository.ts src/server/features/repositories/clinic-repository.ts
git commit -m "feat: matchStoresByVector/matchClinicsByVector — RPC 래퍼 추가"
```

---

## Task 7: search-handler에 store/clinic 파이프라인 적용

**Files:**
- Modify: `src/server/features/chat/tools/search-handler.ts`

- [ ] **Step 1: import 추가**

기존 import 섹션에 추가:

```typescript
import { matchStoresByVector } from '@/server/features/repositories/store-repository';
import { matchClinicsByVector } from '@/server/features/repositories/clinic-repository';
import { scoreStores } from '@/server/features/beauty/store';
import { scoreClinics } from '@/server/features/beauty/clinic';
```

- [ ] **Step 2: searchStore 함수 교체**

기존 `searchStore` 함수 (L207~L227)를 교체:

```typescript
async function searchStore(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
) {
  const storeFilters = {
    store_type: filters?.category,
    english_support: filters?.english_support,
    district: undefined as string | undefined,
    search: undefined as string | undefined,
  };

  // §5.2 벡터/SQL 분기
  const stores = await searchWithFallback(
    query,
    (embedding) => matchStoresByVector(client, embedding, storeFilters, limit),
    () => findStoresByFilters(client, { ...storeFilters, search: query || undefined }, limit),
  );

  // beauty 판단: scoreStores → rank
  const scored = scoreStores(stores);
  const ranked = rank(scored);

  const cards = ranked.map(r => {
    const store = stores.find(s => s.id === r.item.id);
    return {
      ...store,
      reasons: r.item.reasons,
    };
  });

  return { cards, total: cards.length };
}
```

- [ ] **Step 3: searchClinic 함수 교체**

기존 `searchClinic` 함수 (L231~L251)를 교체:

```typescript
async function searchClinic(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
) {
  const clinicFilters = {
    clinic_type: filters?.category,
    english_support: filters?.english_support,
    district: undefined as string | undefined,
    search: undefined as string | undefined,
  };

  // §5.2 벡터/SQL 분기
  const clinics = await searchWithFallback(
    query,
    (embedding) => matchClinicsByVector(client, embedding, clinicFilters, limit),
    () => findClinicsByFilters(client, { ...clinicFilters, search: query || undefined }, limit),
  );

  // beauty 판단: scoreClinics → rank
  const scored = scoreClinics(clinics);
  const ranked = rank(scored);

  const cards = ranked.map(r => {
    const clinic = clinics.find(c => c.id === r.item.id);
    return {
      ...clinic,
      reasons: r.item.reasons,
    };
  });

  return { cards, total: cards.length };
}
```

- [ ] **Step 4: tsc 확인 + 기존 테스트 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors, 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/chat/tools/search-handler.ts
git commit -m "feat: store/clinic 검색에 벡터 검색 + scoring + rank 파이프라인 적용"
```

---

## Task 8: 프롬프트 개선 — domain guide + Answer first 강화

**Files:**
- Modify: `src/server/features/chat/prompts.ts`

- [ ] **Step 1: ROLE_SECTION에 빈 응답 방지 지시 추가**

`ROLE_SECTION`의 `Response style:` 항목 마지막에 추가:

```
- Never return an empty response. If you are unsure how to help, ask a clarifying question
  or suggest popular K-beauty topics the user might be interested in.
```

- [ ] **Step 2: TOOLS_SECTION domain guide 수정**

기존 domain selection guide (L234~L237):
```
- User asks about stores, shops, where to buy, Olive Young, duty-free → domain: "store"
- User asks about clinics, dermatologists, where to get treatments → domain: "clinic"
```

교체:
```
- User asks about stores, shops, Olive Young, duty-free → domain: "store"
- User asks about clinics, dermatologists, where to get treatments → domain: "clinic"
- User asks "where can I buy [specific product]?" → use get_external_links if the product
  was already shown, or search domain: "shopping" (which includes related stores)
```

- [ ] **Step 3: buildNoProfileSection의 "Answer first" 강화**

`buildNoProfileSection`의 `**Your approach:**` 섹션에서 첫 번째 불릿을 수정:

기존:
```
- Answer their questions with broadly applicable recommendations
```

교체:
```
- **ALWAYS recommend first.** Search for products or treatments before asking questions.
  Give at least one concrete recommendation with every response, even without profile data.
  Then naturally ask ONE question to improve future recommendations.
```

- [ ] **Step 4: tsc + 프롬프트 테스트 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/chat/prompts.ts
git commit -m "fix: 프롬프트 개선 — domain guide 수정 + Answer first 강화 + 빈 응답 방지"
```

---

## Task 9: Few-shot 예시 추가

**Files:**
- Modify: `src/server/features/chat/prompt-examples.ts`

- [ ] **Step 1: 3개 예시 추가**

`FEW_SHOT_EXAMPLES` 문자열 끝 (마지막 `</example>` 뒤)에 추가:

```typescript
// 기존 FEW_SHOT_EXAMPLES 끝에 연결

<example>
User: "Where's a good store to buy skincare in Myeongdong?"
Context: No user profile.

You call search_beauty_data with query="skincare store Myeongdong", domain="store".
The tool returns 3 store cards.

Your response:
"Myeongdong is packed with great beauty stores! The first one is a flagship Olive Young right on the main street — they have English-speaking staff and tax refund service. The second is a duty-free beauty outlet with great deals for tourists. Want me to find specific products to grab while you're there?"
</example>

<example>
User: "I have combination skin and want anti-aging products"
Context: User profile exists with skin_type=combination, concerns=[wrinkles, dullness], age_range=35-39.

You call search_beauty_data with query="anti-aging products combination skin", domain="shopping", filters including skin_types=["combination"], concerns=["wrinkles","dullness"].
The tool returns 3 product cards.

Your response:
"Great choices for combination skin! The first uses retinol for wrinkles without being too heavy — it's gel-based so it won't clog your T-zone. The second targets dullness with vitamin C while keeping your skin balanced. Since your skin is combination, I made sure none of these are overly rich — your T-zone will thank you. Want me to compare prices or find clinics for professional anti-aging treatments?"
</example>

<example>
User: "What should I buy at Olive Young?"
Context: No user profile. This is the first message.

You call search_beauty_data with query="popular Olive Young bestsellers", domain="shopping", no filters.
The tool returns 3 product cards.
You do NOT call extract_user_profile because the user shared no personal information.

Your response:
"Here are some Olive Young bestsellers that tourists love! The snail mucin essence is a crowd favorite — it's lightweight and great for hydration. The sunscreen is another must-grab — it's non-greasy and perfect under makeup. By the way, what's your skin type? I can make my next picks even more tailored for you."
</example>
```

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/chat/prompt-examples.ts
git commit -m "feat: few-shot 예시 3개 추가 — store/combination skin/no-profile"
```

---

## Task 10: Eval 시나리오 확장

**Files:**
- Modify: `scripts/fixtures/eval-scenarios.json`

- [ ] **Step 1: store/clinic/multi-domain 시나리오 추가**

`scenarios` 배열 끝에 5개 시나리오 추가:

```json
{
  "id": "S1",
  "category": "store_clinic",
  "name": "Store recommendation → actionable result",
  "profile": { "skin_type": "oily", "language": "en" },
  "messages": [
    { "role": "user", "text": "Where can I buy good skincare products in Myeongdong?" }
  ],
  "rubric": [
    { "criterion": "store_info", "description": "Response mentions specific stores or store types (Olive Young, duty-free, etc.)" },
    { "criterion": "location_relevant", "description": "Response is relevant to Myeongdong area" },
    { "criterion": "actionable", "description": "Response provides enough info to actually visit a store" }
  ]
},
{
  "id": "S2",
  "category": "store_clinic",
  "name": "Clinic recommendation → treatment context",
  "profile": { "skin_type": "combination", "skin_concerns": ["acne", "dark_spots"], "language": "en" },
  "messages": [
    { "role": "user", "text": "Can you recommend a good dermatology clinic for acne scar treatment?" }
  ],
  "rubric": [
    { "criterion": "clinic_info", "description": "Response mentions clinics or clinic types relevant to dermatology" },
    { "criterion": "treatment_relevant", "description": "Response connects to acne scar treatments (laser, peel, etc.)" },
    { "criterion": "practical_info", "description": "Response includes practical info like English support, booking, or area" }
  ]
},
{
  "id": "S3",
  "category": "store_clinic",
  "name": "Multi-domain follow-up → maintains context",
  "profile": { "skin_type": "dry", "skin_concerns": ["wrinkles"], "language": "en" },
  "messages": [
    { "role": "user", "text": "I need a good moisturizer for dry skin." },
    { "role": "user", "text": "Where can I buy it in Gangnam?" }
  ],
  "rubric": [
    { "criterion": "maintains_product_context", "description": "Second response refers back to the moisturizer or dry skin from the first message" },
    { "criterion": "store_info", "description": "Provides store or location information for Gangnam area" },
    { "criterion": "coherent_flow", "description": "Conversation flows naturally without repeating the full recommendation" }
  ]
},
{
  "id": "P6",
  "category": "personalization",
  "name": "No profile + product request → recommend first",
  "profile": null,
  "messages": [
    { "role": "user", "text": "I'm looking for a good sunscreen for my trip to Seoul" }
  ],
  "rubric": [
    { "criterion": "recommends_first", "description": "Provides at least one product recommendation before asking any profile questions" },
    { "criterion": "relevant_product", "description": "Recommends sunscreen or UV protection products" },
    { "criterion": "natural_followup", "description": "If asking a profile question, it comes after the recommendation and feels natural" }
  ]
},
{
  "id": "P7",
  "category": "personalization",
  "name": "Skin concern chat → ingredient info",
  "profile": { "skin_type": "sensitive", "skin_concerns": ["redness"], "language": "en" },
  "messages": [
    { "role": "user", "text": "I've been struggling with redness on my cheeks. Is centella good for that?" }
  ],
  "rubric": [
    { "criterion": "ingredient_info", "description": "Provides information about centella asiatica and its benefits for redness" },
    { "criterion": "product_suggestion", "description": "Suggests products or treatments containing centella or related to redness" },
    { "criterion": "personalized", "description": "Connects the advice to the user's sensitive skin type and redness concern" }
  ]
}
```

- [ ] **Step 2: JSON 유효성 확인**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/fixtures/eval-scenarios.json')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: 커밋**

```bash
git add scripts/fixtures/eval-scenarios.json
git commit -m "feat: eval 시나리오 5개 추가 — store/clinic/multi-domain/ingredient"
```

---

## Task 11: P1/P4/P5 rubric 보정

**Files:**
- Modify: `scripts/fixtures/eval-scenarios.json`

- [ ] **Step 1: P4 rubric 수정 — combination_aware 완화**

P4의 `combination_aware` criterion 교체:

기존:
```json
{ "criterion": "combination_aware", "description": "Acknowledges combination skin needs (not too heavy, not too light) or zone-specific advice" }
```

교체:
```json
{ "criterion": "combination_aware", "description": "Recommends products suitable for combination skin. Acknowledging combination skin characteristics in the recommendation text is ideal but not required if the products themselves are appropriate." }
```

- [ ] **Step 2: P5 rubric 수정 — 명확화 질문 허용**

P5의 `generic_recs` criterion 교체:

기존:
```json
{ "criterion": "generic_recs", "description": "Provides general popular K-beauty recommendations (not personalized to any skin type)" }
```

교체:
```json
{ "criterion": "generic_recs", "description": "Either provides popular K-beauty recommendations OR asks a helpful clarifying question while offering initial suggestions. Both are valid for a no-profile user." }
```

- [ ] **Step 3: JSON 유효성 + 커밋**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/fixtures/eval-scenarios.json')); console.log('Valid')"`

```bash
git add scripts/fixtures/eval-scenarios.json
git commit -m "fix: P4/P5 rubric 보정 — combination skin 완화 + 명확화 질문 허용"
```

---

## Task 12: 전체 검증

- [ ] **Step 1: tsc + lint + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors, 전체 테스트 통과

- [ ] **Step 2: eval harness 실행 (dev 서버 필요)**

Run: `set -a && source .env.local && set +a && npx tsx scripts/eval-chat-quality.ts`
Expected: 25개 시나리오 실행, PASS율 확인

- [ ] **Step 3: calibration-notes.md 업데이트**

Run 결과를 calibration-notes.md에 Run 8로 기록.

- [ ] **Step 4: TODO.md 업데이트**

진행률 반영.

- [ ] **Step 5: 최종 커밋**

```bash
git add scripts/fixtures/calibration-notes.md TODO.md
git commit -m "docs: Run 8 결과 기록 + TODO 업데이트"
```

---

## 의존성 순서

```
Task 1 (클라이언트 방어) ─────── 독립
Task 2 (서버 방어) ──────────── 독립
Task 3 (store scoring) ─────── 독립
Task 4 (clinic scoring) ────── 독립
Task 5 (DB migration) ──────── 독립
Task 6 (repository 함수) ───── Task 5 이후
Task 7 (search-handler) ───── Task 3,4,6 이후
Task 8 (프롬프트) ─────────── 독립
Task 9 (few-shot) ─────────── 독립
Task 10 (eval 시나리오) ────── 독립
Task 11 (rubric 보정) ──────── 독립
Task 12 (전체 검증) ────────── 전체 완료 후
```

Task 1-5, 8-11은 병렬 실행 가능. Task 6→7은 순차.
