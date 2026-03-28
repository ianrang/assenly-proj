# P2-24: Chat 히스토리 API 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/chat/history` — 대화 히스토리 조회. 클라이언트 Chat UI 초기 로드 시 이전 메시지 표시용.

**Architecture:** `app/api/chat/history/route.ts` (skeleton→구현). L-1 thin route. core/memory의 `loadRecentMessages` 재사용. conversation_id 없으면 최신 대화 자동 조회.

**Tech Stack:** Next.js App Router, Zod, Supabase

---

## 선행 확인

- [x] core/auth: authenticateUser (P2-9)
- [x] core/db: createAuthenticatedClient (P2-2)
- [x] core/rate-limit: checkRateLimit (P2-5)
- [x] core/memory: loadRecentMessages (P2-8) — 턴 기반 최근 N개 메시지 로드

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| GET /api/chat/history | api-spec.md §2.6 | api-spec.md:371 |
| conversation_id 선택. 없으면 최신 대화 | api-spec.md §2.6 "conversation_id (선택. 없으면 최신 대화)" | api-spec.md:375 |
| loadRecentMessages 재사용 | core/memory에 이미 구현. 턴 기반 + RLS | P2-8 |
| rate limit: 60/분 (사용자 읽기) | api-spec.md §4.1 | api-spec.md:478 |
| 응답: messages 배열 | api-spec.md §2.6 "messages 배열 (role, content, card_data, created_at)" | api-spec.md:377 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/app/api/chat/history/route.ts` | skeleton→구현 | GET handler |
| `src/app/api/chat/history/route.test.ts` | 신규 | 단위 테스트 |

## 의존성 방향

```
app/api/chat/history/route.ts (Composition Root)
  ├──→ core/auth (authenticateUser)
  ├──→ core/db (createAuthenticatedClient)
  ├──→ core/rate-limit (checkRateLimit)
  ├──→ core/memory (loadRecentMessages)
  └��─→ shared/constants/ai (TOKEN_CONFIG — historyLimit)

  ✗ features/ service import 없음 (단순 조회이므로 route에서 직접 처리)
```

---

## Task 1: route.ts 구현 + 테스트

**Files:**
- Modify: `src/app/api/chat/history/route.ts`
- Create: `src/app/api/chat/history/route.test.ts`

- [ ] **Step 1: route.ts 작성**

```typescript
import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { loadRecentMessages } from '@/server/core/memory';
import { TOKEN_CONFIG } from '@/shared/constants/ai';

// ============================================================
// GET /api/chat/history — api-spec.md §2.6
// L-1: thin route (인증 → 검증 → 조회 → 응답).
// core/memory loadRecentMessages 재사용.
// ============================================================

/** Q-1: 쿼리 파라미터 검증 */
const historyQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function GET(req: Request) {
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

  // 2. Rate limit — api-spec.md §4.1: 사용자 읽기 60/분
  const rateResult = checkRateLimit(user.id, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 3. 쿼리 파라미터 추출 + 검증
  const url = new URL(req.url);
  const rawConversationId = url.searchParams.get('conversation_id') ?? undefined;
  const parsed = historyQuerySchema.safeParse({ conversation_id: rawConversationId });
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid conversation_id format', details: null } },
      { status: 400 },
    );
  }

  // 4. DB 클라이언트 (RLS 적용)
  const client = createAuthenticatedClient(user.token);

  try {
    // 5. conversation_id 확인 (없으면 최신 대화 조회)
    let conversationId = parsed.data.conversation_id;

    if (!conversationId) {
      const { data: latest } = await client
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest) {
        // 대화 없음 → 빈 배열 반환
        return Response.json(
          { data: { messages: [], conversation_id: null } },
          { status: 200 },
        );
      }
      conversationId = (latest as { id: string }).id;
    }

    // 6. 히스토리 로드 — core/memory 재��용
    const historyLimit = TOKEN_CONFIG.default.historyLimit;
    const rawMessages = await loadRecentMessages(client, conversationId, historyLimit);

    // api-spec.md §2.6: role, content, card_data, created_at만 반환. tool_calls 미포함.
    const messages = rawMessages.map(({ role, content, card_data, created_at }) => ({
      role, content, card_data, created_at,
    }));

    return Response.json(
      { data: { messages, conversation_id: conversationId } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[chat/history] load failed', String(error));
    return Response.json(
      { error: { code: 'HISTORY_LOAD_FAILED', message: 'Failed to load chat history', details: null } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: 테스트 작성**

6개 테스트:
1. 인증 실패 → 401
2. rate limit 초과 → 429
3. 잘못된 conversation_id → 400
4. 정상 요청 (conversation_id 있음) → messages 반환
5. conversation_id 없음 → 최신 대화 자동 조회
6. 대화 없음 → 빈 배열 + conversation_id null

- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 전체 테스트 실행**
- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/history/route.ts src/app/api/chat/history/route.test.ts
git commit -m "feat(P2-24): GET /api/chat/history — 대화 히스토리 조회

인증+rate limit(60/분)+conversation_id 검증.
conversation_id 없으면 최신 대화 자동 조회.
core/memory loadRecentMessages 재사용. 테스트 6개.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] L-0a server-only 첫줄
[ ] L-1  thin route: 인증→검증→조회→응답. 비즈니스 로직 없음
[ ] V-1  import: core/ + shared/ ONLY
[ ] V-5  콜 스택 ≤ 4: route→loadRecentMessages→Supabase
[ ] V-9  중복: loadRecentMessages 재사용, 새로 작성 없음
```

### 품질

```
[ ] Q-1  zod 검증 (historyQuerySchema)
[ ] Q-7  에러 불삼킴
[ ] Q-8  env 직접 접근 없음 (TOKEN_CONFIG 경유)
[ ] G-4  미사용 import 없음
[ ] G-10 rate limit 상수
[ ] VP-3 conversation_id 미존재 → 빈 배열 반환
```

### 기존 route 일관성

```
[ ] onboarding/route.ts + chat/route.ts ��턴 동일: 인증→rate limit→검증→client→조회→응답
[ ] 에러 형식: { error: { code, message, details } }
[ ] 성공 형식: { data: { ... } }
```
