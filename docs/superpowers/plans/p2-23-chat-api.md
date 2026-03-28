# P2-23: Chat API Route 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/chat` — SSE 스트리밍 채팅 API. Composition Root (P-4): 인증 + 입력 검증 + cross-domain 조회 + chatService 호출 + 스트리밍 반환 + 비동기 후처리.

**Architecture:** `app/api/chat/route.ts` (skeleton→구현). L-1 thin route 패턴 (onboarding/route.ts 참조). profile/journey를 route에서 조회하여 chatService에 파라미터 전달 (L-3). 비동기 후처리(히스토리 저장, 추출 결과 저장)는 Q-15 격리.

**Tech Stack:** Next.js App Router, Vercel AI SDK 6.x, Zod, Supabase

---

## 선행 확인

- [x] chatService: streamChat (P2-19) — conversation + prompt + LLM + tools
- [x] core/auth: authenticateUser (P2-9)
- [x] core/db: createAuthenticatedClient, createServiceClient (P2-2)
- [x] core/rate-limit: checkRateLimit (P2-5)
- [x] core/memory: saveMessages (P2-8)
- [x] profile/service: getProfile (P2-10)
- [x] journey/service: getActiveJourney (P2-11)

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| L-1 thin route | 인증→검증→조회→service 호출→반환 | CLAUDE.md L-1 |
| P-4 Composition Root | cross-domain(profile, journey) 조회 + chatService에 파라미터 전달 | CLAUDE.md P-4, L-3 |
| SSE: toUIMessageStreamResponse | AI SDK 6.x 스트리밍 | api-spec.md §3.2 |
| 비동기 후처리: Q-15 격리 | saveMessages + 추출 결과 저장 — 실패해도 응답 무영향 | CLAUDE.md Q-15, api-spec.md §3.4 step 9-11 |
| service_role 사용 (비동기) | 토큰 만료 가능. service_role로 직접 기록 | auth-matrix.md §5.4 line 647 |
| rate limit: 5/분 + 100/일 | api-spec.md §4.1 | api-spec.md:475-476 |
| preferences: route에서 직접 조회 | P2-26 behavior service 미구현. client.from 직접 조회 | P-4 (route는 Composition Root) |
| derived: MVP null | DV-1/2는 beauty/에서 계산. DV-4는 v0.2. derived는 chatService 내부에서 필요 시 계산 가능하지만, 시스템 프롬프트 빌드용 derived는 route에서 null 전달 (MVP 단순화) | P2-15 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/app/api/chat/route.ts` | skeleton→구현 | Composition Root: POST handler |
| `src/app/api/chat/route.test.ts` | 신규 | 단위 테스트 |

## 의존성 방향 (L-1, P-4)

```
app/api/chat/route.ts (Composition Root)
  ├──→ core/auth (authenticateUser)
  ├──→ core/db (createAuthenticatedClient, createServiceClient)
  ├──→ core/rate-limit (checkRateLimit)
  ├──→ core/memory (saveMessages)
  ├──→ features/profile/service (getProfile) — cross-domain, P-4
  ├──→ features/journey/service (getActiveJourney) — cross-domain, P-4
  └──→ features/chat/service (streamChat) — 주 service

  ✗ features/ 간 service 직접 호출 아님 — app/ Composition Root에서 조합 (P-4)
```

---

## Task 1: route.ts 구현

**Files:**
- Modify: `src/app/api/chat/route.ts` (skeleton→구현)

- [ ] **Step 1: route.ts 작성**

```typescript
import 'server-only';
import { z } from 'zod';
import type { UserProfile, Journey } from '@/shared/types/profile';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
// TODO(P2-24): saveMessages는 AI SDK onFinish 콜백 통합 시 사용. 현재 미import (G-4).
import { getProfile } from '@/server/features/profile/service';
import { getActiveJourney } from '@/server/features/journey/service';
import { streamChat } from '@/server/features/chat/service';

// ============================================================
// POST /api/chat — api-spec.md §3.1
// L-1: thin route (인증 → 검증 → cross-domain 조회 → service → 반환).
// P-4: Composition Root — profile + journey + chat service 조합.
// Q-15: 비동기 후처리 격리 (히스토리 저장, 추출 결과 저장).
// ============================================================

/** Q-1: zod 입력 검증 — api-spec.md §3.1 */
const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().uuid().nullable().optional(),
});

/** api-spec.md §4.1: Chat rate limit */
const RATE_LIMIT_MINUTE = { limit: 5, windowMs: 60 * 1000, window: 'minute' } as const;
const RATE_LIMIT_DAILY = { limit: 100, windowMs: 24 * 60 * 60 * 1000, window: 'daily' } as const;

function rateLimitHeaders(remaining: number, resetAt: number, limit: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export async function POST(req: Request) {
  // 1. 인증 (auth-matrix.md §3.3: 필수)
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit — api-spec.md §4.1: 분당 5회 + 일일 100회
  const minuteResult = checkRateLimit(user.id, 'chat', RATE_LIMIT_MINUTE);
  if (!minuteResult.allowed) {
    const retryAfter = Math.ceil((minuteResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'CHAT_RATE_LIMITED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { ...rateLimitHeaders(minuteResult.remaining, minuteResult.resetAt, RATE_LIMIT_MINUTE.limit), 'Retry-After': String(retryAfter) } },
    );
  }

  const dailyResult = checkRateLimit(user.id, 'chat', RATE_LIMIT_DAILY);
  if (!dailyResult.allowed) {
    return Response.json(
      { error: { code: 'CHAT_RATE_LIMITED', message: 'Daily chat limit reached.', details: null } },
      { status: 429, headers: rateLimitHeaders(dailyResult.remaining, dailyResult.resetAt, RATE_LIMIT_DAILY.limit) },
    );
  }

  // 3. 입력 검증 (Q-1)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body', details: null } },
      { status: 400 },
    );
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. DB 클라이언트 (RLS 적용)
  const client = createAuthenticatedClient(user.token);

  // 5. Cross-domain 데이터 조회 (L-3, P-4)
  // ProfileRow/JourneyRow → UserProfile/Journey 타입 단언
  // getProfile은 ProfileRow(내부 타입)를 반환하지만 구조적으로 UserProfile 호환. MVP 타입 단언.
  const [profile, journey] = await Promise.all([
    getProfile(client, user.id).catch(() => null) as Promise<UserProfile | null>,
    getActiveJourney(client, user.id).catch(() => null) as Promise<Journey | null>,
  ]);

  // learned_preferences 조회 (P2-26 미구현 → 직접 조회)
  const { data: preferencesData } = await client
    .from('learned_preferences')
    .select('*')
    .eq('user_id', user.id);
  const preferences = preferencesData ?? [];

  // 6. chatService 호출 (step 3~8)
  try {
    const result = await streamChat({
      client,
      userId: user.id,
      conversationId: parsed.data.conversation_id ?? null,
      message: parsed.data.message,
      profile,
      journey,
      preferences,
      derived: null,  // MVP: DV-4 미구현. beauty/ DV-1/2는 search-handler 내부 계산.
    });

    // 7. 비동기 후처리 (Q-15: 격리. 실패해도 응답 무영향)
    // auth-matrix.md §5.4: service_role 사용 (토큰 만료 대비)
    const afterWork = async () => {
      try {
        const serviceClient = createServiceClient();

        // TODO(P2-24): step 9 히스토리 저장 — AI SDK onFinish 콜백에서 saveMessages 호출
        // TODO(P2-26): step 10 행동 로그 — behavior service에서 처리

        // step 11: 추출 결과 조건부 저장
        if (result.extractionResults.length > 0 && profile) {
          for (const extraction of result.extractionResults) {
            if (extraction.skin_type) {
              await serviceClient
                .from('user_profiles')
                .update({ skin_type: extraction.skin_type })
                .eq('user_id', user.id);
            }
          }
        }
      } catch (error) {
        console.error('[chat/after] async post-processing failed', String(error));
      }
    };

    // Q-15: 비동기 실행 — 응답 반환 후 처리
    void afterWork();

    // 8. SSE 스트리밍 반환 — api-spec.md §3.2
    const stream = result.stream as { toUIMessageStreamResponse: () => Response };
    return stream.toUIMessageStreamResponse();
  } catch (error) {
    // MVP: CHAT_LLM_TIMEOUT vs CHAT_LLM_ERROR 미구분.
    // callWithFallback이 timeout을 AbortError로 throw하지만 구분 없이 500 반환.
    // v0.2: AbortError 감지 → CHAT_LLM_TIMEOUT (408) 분리.
    console.error('[chat] streamChat failed', String(error));
    return Response.json(
      { error: { code: 'CHAT_LLM_ERROR', message: 'Failed to process chat request', details: null } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

---

## Task 2: 테스트 작성 + 실행

**Files:**
- Create: `src/app/api/chat/route.test.ts`

**테스트 케이스 (8개)**:

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | 인증 실패 → 401 AUTH_REQUIRED | |
| 2 | rate limit 초과 → 429 CHAT_RATE_LIMITED | |
| 3 | 잘못된 JSON → 400 VALIDATION_FAILED | |
| 4 | message 빈 문자열 → 400 VALIDATION_FAILED | |
| 5 | 정상 요청 → streamChat 호출 + SSE 반환 | |
| 6 | profile null (VP-3) → chatService에 null 전달 | |
| 7 | chatService 에러 → 500 CHAT_LLM_ERROR | |
| 8 | conversation_id null → 새 대화 생성 | |

- [ ] **Step 1: 테스트 작성**
- [ ] **Step 2: 테스트 실행**
- [ ] **Step 3: 전체 테스트 실행**
- [ ] **Step 4: Commit**

---

## 검증 체크리스트

### 아키텍처

```
[ ] L-1  thin route: 인증→검증→조회→service→반환. 비즈니스 로직 없음
[ ] P-4  Composition Root: profile + journey + chatService 조합
[ ] L-3  cross-domain: getProfile + getActiveJourney route에서 조회
[ ] V-3  cross-domain 파라미터 전달 검증
[ ] V-5  콜 스택 ≤ 4
[ ] R-9  chatService가 profile/journey 미import (route에서 파라미터 전달)
[ ] Q-15 비동기 쓰기 격리: afterWork 실패해도 응답 무영향
```

### 품질

```
[ ] Q-1  zod 입력 검증 (chatRequestSchema)
[ ] Q-7  에러 불삼킴: catch에서 에러 응답 또는 console.error
[ ] Q-8  env 직접 접근 없음 (core/config 경유)
[ ] G-10 rate limit 상수
[ ] VP-3 profile/journey null 허용
```

### 기존 route 일관성

```
[ ] onboarding/route.ts 패턴 동일: 인증→rate limit→검증→client→service→응답
[ ] 에러 코드 형식: { error: { code, message, details } }
[ ] rate limit 헤더: X-RateLimit-Limit/Remaining/Reset
```
