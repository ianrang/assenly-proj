# P2-26: 행동 로그 서비스 + API 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/events` — 사용자 행동 이벤트 수집. MVP KPI(K1~K5) 측정 데이터 소스.

**Architecture:** `app/api/events/route.ts` L-1 thin route. 이벤트별 zod 스키마로 검증 후 `behavior_logs` bulk INSERT. Q-15 fire-and-forget (부분 실패 허용).

**Tech Stack:** Next.js App Router, Zod, Supabase

---

## G-14 설계 교차 검증

| 확인 항목 | 원문 | 결과 |
|----------|------|------|
| behavior_logs 테이블 | 001_initial_schema.sql:89-97 | ✅ 이미 존재. migration 불필요 (V-23) |
| RLS | 001:359-363 | ✅ SELECT + INSERT for authenticated |
| 인덱스 | 001:286 idx_behavior_logs_user_id | ✅ |
| POST /api/events | api-spec.md §2.7 line 381 | ✅ |
| 이벤트 5개 | ANALYTICS.md §3.2 | ✅ path_a_entry, card_exposure, card_click, external_link_click, kit_cta_submit |
| fire-and-forget | api-spec.md §2.7 line 402 | ✅ Q-15 |
| rate limit | api-spec.md §4.1: POST /api/events 전용 제한 미정의. GET /api/* 60/분 버킷을 공유 (endpoint='public'). 이벤트 배칭(max 50/req)으로 실질 부담 경미 | ✅ |
| target_type CHECK | schema.dbml:189 | product/store/clinic/treatment/card/link |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/app/api/events/route.ts` | 신규 | POST /api/events handler |
| `src/app/api/events/route.test.ts` | 신규 | 단위 테스트 |

migration 불필요. behavior_logs 테이블은 001에 이미 존재.

## 의존성 방향

```
app/api/events/route.ts (Composition Root)
  ├──→ core/auth (authenticateUser)
  ├──→ core/db (createAuthenticatedClient)
  ├──→ core/rate-limit (checkRateLimit)
  └──→ zod (외부)

  ✗ features/ service 없음 (단순 INSERT, L-1 thin route)
```

---

## Task 1: route.ts 구현 + 테스트

- [ ] **Step 1: route.ts 작성**

```typescript
import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';

// ============================================================
// POST /api/events — api-spec.md §2.7
// L-1: thin route (인증 → 검증 → INSERT → 응답).
// ANALYTICS.md §3.2: 4개 클라이언트 이벤트 타입.
// Q-15: DB INSERT 실패 시 응답에 영향 없음 (fire-and-forget).
// ============================================================

/** 이벤트별 metadata 스키마 — ANALYTICS.md §3.2 */
const metadataSchemas: Record<string, z.ZodType> = {
  path_a_entry: z.object({
    source: z.literal('landing'),
  }),
  card_exposure: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    position: z.number().int().nonnegative(),
    conversation_id: z.string().uuid(),
  }),
  card_click: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    conversation_id: z.string().uuid(),
  }),
  external_link_click: z.object({
    card_id: z.string().min(1),
    link_type: z.enum(['naver_map', 'kakao_map', 'website', 'purchase', 'booking', 'phone']),
    url: z.string().url(),
    conversation_id: z.string().uuid(),
  }),
  // kit_cta_submit: 서버 전용 (api-spec.md §2.7 line 400). POST /api/kit/claim에서 직접 기록.
};

const VALID_EVENT_TYPES = Object.keys(metadataSchemas);

const VALID_TARGET_TYPES = ['product', 'store', 'clinic', 'treatment', 'card', 'link'] as const;

/** Q-1: 단일 이벤트 스키마 */
const eventSchema = z.object({
  event_type: z.string().refine(t => VALID_EVENT_TYPES.includes(t), { message: 'Invalid event_type' }),
  target_id: z.string().uuid().nullable().optional(),
  target_type: z.enum(VALID_TARGET_TYPES).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Q-1: 요청 전체 스키마 */
const eventsRequestSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function POST(req: Request) {
  // 1. 인증
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit — api-spec.md §4.1: 60/분 (public 공유)
  const rateResult = checkRateLimit(user.id, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
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

  const parsed = eventsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. 이벤트별 metadata 검증
  const validEvents: Array<{
    user_id: string;
    event_type: string;
    target_id: string | null;
    target_type: string | null;
    metadata: unknown;
  }> = [];

  for (const event of parsed.data.events) {
    const metaSchema = metadataSchemas[event.event_type];
    if (metaSchema) {
      // ANALYTICS.md §3.1: 모든 이벤트는 metadata 필수
      if (!event.metadata) continue; // metadata 없음 → 스킵
      const metaResult = metaSchema.safeParse(event.metadata);
      if (!metaResult.success) continue; // 잘못된 metadata → 스킵
    }

    validEvents.push({
      user_id: user.id,
      event_type: event.event_type,
      target_id: event.target_id ?? null,
      target_type: event.target_type ?? null,
      metadata: event.metadata ?? null,
    });
  }

  if (validEvents.length === 0) {
    return Response.json(
      { data: { recorded: 0 } },
      { status: 200 },
    );
  }

  // 5. bulk INSERT — Q-15: fire-and-forget (부분 실패 허용)
  const client = createAuthenticatedClient(user.token);

  try {
    const { error } = await client
      .from('behavior_logs')
      .insert(validEvents);

    if (error) {
      console.error('[events] bulk insert failed', String(error));
      // Q-15: 실패해도 응답은 정상 반환 (fire-and-forget 정신)
      return Response.json(
        { data: { recorded: 0 } },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error('[events] unexpected error', String(error));
    return Response.json(
      { data: { recorded: 0 } },
      { status: 200 },
    );
  }

  // 6. 응답 — api-spec.md §2.7
  return Response.json(
    { data: { recorded: validEvents.length } },
    { status: 200 },
  );
}
```

- [ ] **Step 2: 테스트 작성**

7개 테스트:
1. 인증 실패 → 401
2. rate limit → 429
3. 빈 events 배열 → 400
4. 정상 card_click 이벤트 → 200 { recorded: 1 }
5. 잘못된 event_type → 400
6. 잘못된 metadata → 해당 이벤트 스킵, 나머지 기록
7. DB INSERT 에러 → 200 { recorded: 0 } (Q-15)

- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 전체 테스트 실행**
- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/route.ts src/app/api/events/route.test.ts
git commit -m "feat(P2-26): POST /api/events — 행동 로그 수집

4개 클라이언트 이벤트 타입 (ANALYTICS.md §3.2): path_a_entry, card_exposure,
card_click, external_link_click, kit_cta_submit.
이벤트별 metadata zod 검증. bulk INSERT. Q-15 fire-and-forget.
테스트 7개.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] L-0a server-only 첫줄
[ ] L-1  thin route: 인증→검증→INSERT→응답. 비즈니스 로직 없음
[ ] V-1  import: core/ + zod ONLY
[ ] V-22 스키마 정합성: behavior_logs 컬럼(event_type, target_id, target_type, metadata)과 INSERT 필드 일치
[ ] V-23 migration 불필요: 001에 이미 존재. 이슈로 재분류 안 함
```

### 품질

```
[ ] Q-1  zod 검증 (eventsRequestSchema + 이벤트별 metadata)
[ ] Q-7  에러 로깅: console.error
[ ] Q-15 fire-and-forget: DB 실패해도 200 반환
[ ] G-4  미사용 import 없음
[ ] G-10 상수: RATE_LIMIT_CONFIG, VALID_EVENT_TYPES, VALID_TARGET_TYPES
```

### 기존 route 일관성

```
[ ] 인증→rate limit→검증→client→INSERT→응답 패턴
[ ] 에러 형식: { error: { code, message, details } }
[ ] 성공 형식: { data: { recorded: N } }
```
