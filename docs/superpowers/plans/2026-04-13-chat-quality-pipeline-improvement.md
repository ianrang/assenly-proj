# 채팅 품질 파이프라인 개선 Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 응답 방어, store/clinic 검색 품질 개선, 프롬프트 튜닝으로 eval 17/20 → 20/20 목표

**Architecture:** 기존 SSE 스트리밍 파이프라인 유지. 클라이언트 빈 응답 감지 + 자동 1회 재시도. store/clinic에 beauty judgment(scoring + reasons) 파이프라인 추가. 공통 scoring 상수는 judgment.ts(기반 모듈)에 추출. 프롬프트 few-shot 보강.

**Tech Stack:** AI SDK 6.x (useChat, streamText), Supabase, Vitest

**FAIL → 변경 매핑:**
| FAIL 시나리오 | 근본 원인 | 해결하는 Task |
|-------------|---------|-------------|
| P1 (빈 응답) | Gemini 2.5 Flash outputTokens=0 | Task 1 (클라이언트 자동 재시도) + Task 2 (서버 DB 스킵) |
| P4 (combination_aware) | LLM이 skin type을 명시적으로 언급 안 함 | Task 8 (rubric 보정) + Task 7 (few-shot 추가) |
| P5 (질문 우선) | "Answer first" 원칙이 추상적 | Task 6 (프롬프트 강화) + Task 7 (few-shot 추가) + Task 8 (rubric 보정) |

---

## File Structure

### 신규 파일
| 파일 | 책임 |
|------|------|
| `src/server/features/beauty/store.ts` | Store scoring — english_support, tourist_services, rating, userLanguage 기반 점수 + reasons |
| `src/server/features/beauty/store.test.ts` | scoreStores 단위 테스트 |
| `src/server/features/beauty/clinic.ts` | Clinic scoring — english_support, foreigner_friendly, license_verified, userLanguage 기반 점수 + reasons |
| `src/server/features/beauty/clinic.test.ts` | scoreClinics 단위 테스트 |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/server/features/beauty/judgment.ts` | 공통 scoring 상수 추출 (ENGLISH_SUPPORT_BONUS/LABEL, RATING 상수) |
| `src/server/features/chat/tools/search-handler.ts` | searchStore/searchClinic에 scoring + rank 파이프라인 적용 (SQL 검색 유지) |
| `src/client/features/chat/ChatContent.tsx` | 빈 응답 감지 + 자동 1회 regenerate |
| `src/server/features/api/routes/chat.ts` | 서버 onFinish에서 빈 응답 DB 저장 스킵 |
| `src/server/features/chat/prompts.ts` | domain guide 수정 + "Answer first" 강화 + 빈 응답 방지 지시 |
| `src/server/features/chat/prompt-examples.ts` | few-shot 예시 3개 추가 (store context, combination skin, no-profile generic) |
| `scripts/fixtures/eval-scenarios.json` | 테스트 시나리오 확장 + P4/P5 rubric 보정 |

### NOT in scope (TODO)
| 항목 | 이유 | 다음 PR |
|------|------|---------|
| match_stores/match_clinics RPC | stores/clinics embedding 0건. 데이터 없이 RPC 추가는 죽은 코드 | embedding 생성 스크립트와 함께 구현 |
| store-repository matchStoresByVector | 위와 동일 | 위와 동일 |
| clinic-repository matchClinicsByVector | 위와 동일 | 위와 동일 |
| embedding 생성 스크립트 | 478건(253 stores + 225 clinics) Gemini embedding API 호출 필요. 현재 PR 범위 초과 | 별도 PR |

---

## Task 1: 빈 응답 클라이언트 방어

**Files:**
- Modify: `src/client/features/chat/ChatContent.tsx`

**해결하는 FAIL:** P1 (빈 응답)

- [ ] **Step 1: ChatContent.tsx에 빈 응답 감지 + 자동 재시도 추가**

```typescript
// ChatContent.tsx — 변경 부분만

// 기존 코드 const conversationIdRef = ... 아래에 추가:
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

**해결하는 FAIL:** P1 (빈 응답 시 빈 메시지가 DB에 저장되는 문제 방지)

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

    // ... 기존 저장 로직 (LLM_USAGE 로그 ~ extraction 저장) 그대로 유지
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

## Task 3: judgment.ts 공통 scoring 상수 추출

**Files:**
- Modify: `src/server/features/beauty/judgment.ts`

**근거:** Eng Review Code Quality — english_support 상수가 store.ts/clinic.ts에 중복되면 DRY 위반. judgment.ts는 기반 모듈로 모든 beauty peer가 import 가능 (§2.3 준수).

- [ ] **Step 1: judgment.ts에 공통 상수 추가**

`rank()` 함수 위에 추가:

```typescript
// --- 공통 scoring 상수 — store.ts/clinic.ts에서 import ---
// DB english_support enum 기반. 단일 진실 공급원 (DRY).
// 이 상수를 수정하면 store/clinic 모두 반영됨.

/** english_support 등급별 점수 보너스 */
export const ENGLISH_SUPPORT_BONUS: Record<string, number> = {
  fluent: 0.2,
  good: 0.15,
  basic: 0.05,
  none: 0,
};

/** english_support 등급별 reasons 라벨 */
export const ENGLISH_SUPPORT_LABEL: Record<string, string> = {
  fluent: 'Fluent English support',
  good: 'Good English support',
  basic: 'Basic English available',
};

/** 높은 평점 기준 */
export const HIGH_RATING_THRESHOLD = 4.0;

/** 평점 보너스 점수 */
export const RATING_BONUS = 0.1;
```

주석 업데이트: `G-9: export 7개 (rank, ScoredItem, RankedResult, ENGLISH_SUPPORT_BONUS, ENGLISH_SUPPORT_LABEL, HIGH_RATING_THRESHOLD, RATING_BONUS).`

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/beauty/judgment.ts
git commit -m "refactor: 공통 scoring 상수를 judgment.ts로 추출 (DRY)"
```

---

## Task 4: Store scoring 순수 함수

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
    expect(scored.find(s => s.id === 's2')!.score)
      .toBeGreaterThan(scored.find(s => s.id === 's1')!.score);
    expect(scored.find(s => s.id === 's2')!.reasons).toContain('Fluent English support');
  });

  it('adds reason for tourist services', () => {
    const scored = scoreStores([
      makeStore({ tourist_services: ['tax_refund', 'beauty_consultation'] }),
    ]);
    expect(scored[0].reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('adds reason for high rating', () => {
    const scored = scoreStores([makeStore({ rating: 4.5 })]);
    expect(scored[0].reasons).toContain('Highly rated (4.5)');
  });

  it('adds bonus for matching user language', () => {
    const scored = scoreStores(
      [makeStore({ english_support: 'fluent' })],
      'en',
    );
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(true);
  });

  it('no language bonus when userLanguage is null', () => {
    const scored = scoreStores([makeStore({ english_support: 'fluent' })]);
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(false);
  });

  it('returns all stores (no exclusion)', () => {
    const scored = scoreStores([makeStore({ id: 's1' }), makeStore({ id: 's2' })]);
    expect(scored).toHaveLength(2);
  });

  it('preserves is_highlighted', () => {
    const scored = scoreStores([makeStore({ is_highlighted: true })]);
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
import {
  ENGLISH_SUPPORT_BONUS,
  ENGLISH_SUPPORT_LABEL,
  HIGH_RATING_THRESHOLD,
  RATING_BONUS,
} from './judgment';

// ============================================================
// 매장 도메인 로직 — search-engine.md §3.2 확장
// 외국인 여행객 접근성 기반 점수 + reasons 생성.
// §2.3: store.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreStores).
// ============================================================

const BASE_SCORE = 0.5;
const LANGUAGE_MATCH_BONUS = 0.1;

const TOURIST_SERVICE_LABELS: Record<string, string> = {
  tax_refund: 'Tax refund available',
  beauty_consultation: 'Beauty consultation service',
  multilingual_staff: 'Multilingual staff',
  product_samples: 'Free product samples',
};

/**
 * Store[]에 여행객 접근성 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 * @param userLanguage 사용자 언어 (profile.language). null이면 언어 보너스 미적용.
 */
export function scoreStores(
  stores: Store[],
  userLanguage: string | null = null,
): ScoredItem[] {
  return stores.map((store) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    // 영어 지원 수준
    const engBonus = ENGLISH_SUPPORT_BONUS[store.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[store.english_support];
    if (engLabel) reasons.push(engLabel);

    // 사용자 언어 매칭
    if (userLanguage && userLanguage !== 'ko') {
      const supportsUserLang =
        store.english_support === 'fluent' || store.english_support === 'good';
      if (supportsUserLang) {
        score += LANGUAGE_MATCH_BONUS;
        reasons.push('Supports your language');
      }
    }

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
Expected: 7 passed

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/beauty/store.ts src/server/features/beauty/store.test.ts
git commit -m "feat: scoreStores 순수 함수 — 여행객 접근성 + 언어 매칭 기반 scoring"
```

---

## Task 5: Clinic scoring 순수 함수

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
        foreigner_friendly: { languages: ['en', 'ja'], interpreter: true, international_patients: true },
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

  it('adds bonus for matching user language', () => {
    const scored = scoreClinics(
      [makeClinic({ english_support: 'fluent' })],
      'en',
    );
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(true);
  });

  it('no language bonus when userLanguage is null', () => {
    const scored = scoreClinics([makeClinic({ english_support: 'fluent' })]);
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(false);
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
import {
  ENGLISH_SUPPORT_BONUS,
  ENGLISH_SUPPORT_LABEL,
  HIGH_RATING_THRESHOLD,
  RATING_BONUS,
} from './judgment';

// ============================================================
// 클리닉 도메인 로직 — search-engine.md §3.2 확장
// 외국인 접근성 + 신뢰도 기반 점수 + reasons 생성.
// §2.3: clinic.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreClinics).
// ============================================================

const BASE_SCORE = 0.5;
const LICENSE_BONUS = 0.1;
const BOOKING_BONUS = 0.05;
const FOREIGNER_BONUS = 0.1;
const LANGUAGE_MATCH_BONUS = 0.1;

/**
 * Clinic[]에 외국인 접근성 + 신뢰도 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 * @param userLanguage 사용자 언어 (profile.language). null이면 언어 보너스 미적용.
 */
export function scoreClinics(
  clinics: Clinic[],
  userLanguage: string | null = null,
): ScoredItem[] {
  return clinics.map((clinic) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    // 영어 지원 수준
    const engBonus = ENGLISH_SUPPORT_BONUS[clinic.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[clinic.english_support];
    if (engLabel) reasons.push(engLabel);

    // 사용자 언어 매칭
    if (userLanguage && userLanguage !== 'ko') {
      const supportsUserLang =
        clinic.english_support === 'fluent' || clinic.english_support === 'good';
      if (supportsUserLang) {
        score += LANGUAGE_MATCH_BONUS;
        reasons.push('Supports your language');
      }
    }

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
Expected: 7 passed

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/beauty/clinic.ts src/server/features/beauty/clinic.test.ts
git commit -m "feat: scoreClinics 순수 함수 — 외국인 접근성 + 신뢰도 + 언어 매칭"
```

---

## Task 6: 프롬프트 개선 — domain guide + Answer first 강화

**Files:**
- Modify: `src/server/features/chat/prompts.ts`

**해결하는 FAIL:** P5 (질문 우선 → 추천 우선으로 전환)

- [ ] **Step 1: ROLE_SECTION에 빈 응답 방지 지시 추가**

`ROLE_SECTION`의 `Response style:` 마지막 항목 뒤에 추가:

```
- Never return an empty response. If you are unsure how to help, ask a clarifying question
  or suggest popular K-beauty topics the user might be interested in.
```

- [ ] **Step 2: TOOLS_SECTION domain guide 수정**

기존 L234-237의 domain guide 교체:

기존:
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

- [ ] **Step 4: tsc + 기존 프롬프트 테스트 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/chat/prompts.ts
git commit -m "fix: 프롬프트 — domain guide 수정 + Answer first 강화 + 빈 응답 방지"
```

---

## Task 7: Few-shot 예시 추가

**Files:**
- Modify: `src/server/features/chat/prompt-examples.ts`

**해결하는 FAIL:** P4 (combination skin 예시 부재), P5 (no-profile 매장 질문 예시 부재)

- [ ] **Step 1: 3개 예시 추가**

`FEW_SHOT_EXAMPLES` 끝 (마지막 `</example>` 뒤)에 추가:

```
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

## Task 8: search-handler에 store/clinic scoring 파이프라인 적용

**Files:**
- Modify: `src/server/features/chat/tools/search-handler.ts`

- [ ] **Step 1: import 추가**

기존 import 섹션에 추가:

```typescript
import { scoreStores } from '@/server/features/beauty/store';
import { scoreClinics } from '@/server/features/beauty/clinic';
```

- [ ] **Step 2: searchStore 함수의 context 파라미터 추가 + scoring 적용**

기존 `searchStore` 함수 시그니처와 본문 교체:

```typescript
async function searchStore(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  userLanguage: string | null,
) {
  const storeFilters = {
    store_type: filters?.category,
    english_support: filters?.english_support,
    search: query || undefined,
  };

  const stores = await findStoresByFilters(client, storeFilters, limit);

  // beauty 판단: scoreStores → rank
  const scored = scoreStores(stores, userLanguage);
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

- [ ] **Step 3: searchClinic 함수도 동일하게 수정**

```typescript
async function searchClinic(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  userLanguage: string | null,
) {
  const clinicFilters = {
    clinic_type: filters?.category,
    english_support: filters?.english_support,
    search: query || undefined,
  };

  const clinics = await findClinicsByFilters(client, clinicFilters, limit);

  // beauty 판단: scoreClinics → rank
  const scored = scoreClinics(clinics, userLanguage);
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

- [ ] **Step 4: executeSearchBeautyData에서 userLanguage 전달**

`executeSearchBeautyData` 함수에서 store/clinic 호출 시 language 전달:

```typescript
if (domain === 'store') {
  return await searchStore(client, query, filters, limit, profile?.language ?? null);
}
return await searchClinic(client, query, filters, limit, profile?.language ?? null);
```

- [ ] **Step 5: tsc + 전체 테스트 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors, 전체 테스트 통과

- [ ] **Step 6: 커밋**

```bash
git add src/server/features/chat/tools/search-handler.ts
git commit -m "feat: store/clinic 검색에 scoring + rank 파이프라인 + 언어 매칭 적용"
```

---

## Task 9: Eval 시나리오 확장 + rubric 보정

**Files:**
- Modify: `scripts/fixtures/eval-scenarios.json`

**해결하는 FAIL:** P4 (rubric 보정), P5 (rubric 보정)

- [ ] **Step 1: 5개 시나리오 추가 (store/clinic/multi-domain/ingredient)**

`scenarios` 배열 끝에 추가 (S1, S2, S3, P6, P7 — Task 10의 코드 참조)

- [ ] **Step 2: P4 rubric `combination_aware` 완화**

기존:
```json
{ "criterion": "combination_aware", "description": "Acknowledges combination skin needs (not too heavy, not too light) or zone-specific advice" }
```
교체:
```json
{ "criterion": "combination_aware", "description": "Recommends products suitable for combination skin. Acknowledging combination skin characteristics in the recommendation text is ideal but not required if the products themselves are appropriate." }
```

- [ ] **Step 3: P5 rubric `generic_recs` 완화**

기존:
```json
{ "criterion": "generic_recs", "description": "Provides general popular K-beauty recommendations (not personalized to any skin type)" }
```
교체:
```json
{ "criterion": "generic_recs", "description": "Either provides popular K-beauty recommendations OR asks a helpful clarifying question while offering initial suggestions. Both are valid for a no-profile user." }
```

- [ ] **Step 4: JSON 유효성 확인 + 커밋**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/fixtures/eval-scenarios.json')); console.log('Valid')"`

```bash
git add scripts/fixtures/eval-scenarios.json
git commit -m "feat: eval 시나리오 5개 추가 + P4/P5 rubric 보정"
```

---

## Task 10: 전체 검증

- [ ] **Step 1: tsc + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors, 전체 테스트 통과

- [ ] **Step 2: eval harness 실행 (dev 서버 필요)**

Run: `set -a && source .env.local && set +a && npx tsx scripts/eval-chat-quality.ts`
Expected: 25개 시나리오 실행

- [ ] **Step 3: calibration-notes.md 업데이트**

Run 결과를 `scripts/fixtures/calibration-notes.md`에 기록.

- [ ] **Step 4: TODO.md 업데이트**

벡터 검색 + embedding 생성 TODO 추가. 진행률 반영.

- [ ] **Step 5: 최종 커밋**

```bash
git add scripts/fixtures/calibration-notes.md TODO.md
git commit -m "docs: 검증 결과 + TODO 벡터 검색 항목 추가"
```

---

## 의존성 순서

```
Task 1 (클라이언트 방어) ─────── 독립
Task 2 (서버 방어) ──────────── 독립
Task 3 (judgment 상수 추출) ──── 독립
Task 4 (store scoring) ─────── Task 3 이후
Task 5 (clinic scoring) ────── Task 3 이후
Task 6 (프롬프트) ─────────── 독립
Task 7 (few-shot) ─────────── 독립
Task 8 (search-handler) ───── Task 4,5 이후
Task 9 (eval + rubric) ────── 독립
Task 10 (전체 검증) ────────── 전체 완료 후
```

Task 1-3, 6-7, 9는 병렬 실행 가능. Task 4,5는 Task 3 이후. Task 8은 Task 4,5 이후.
