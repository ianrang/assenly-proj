# P2-28a: API 레이어 Hono 전환 + OpenAPI 자동 문서화

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 15개 Next.js route handler를 Hono + @hono/zod-openapi로 전환. 보일러플레이트 중복 제거 + OpenAPI 자동 문서화. server/core/features/shared **완전 무수정**.

**Architecture:** `app/api/[[...route]]/route.ts`에 Hono 앱 마운트. middleware로 인증/rate limit 추출. createRoute로 스키마+handler+문서 통합. Swagger UI 자동 제공.

**Tech Stack:** Hono >=4.3.6, @hono/zod-openapi >=1.2.4 (Zod 4 지원 확인), @hono/swagger-ui, Zod 4.3.6

---

## 리뷰 이슈 해결 (Critical 3 + Important 6)

### Critical 해결

| # | 이슈 | 해결 |
|---|------|------|
| C1 | Zod 4 호환 | ✅ @hono/zod-openapi 1.2.4 peerdep `zod: ^4.0.0` 확인 |
| C2 | Chat SSE 스트리밍 | chat route는 `app.post()` 사용 (NOT `app.openapi()`). raw Response 반환. honojs/middleware#735 이슈 |
| C3 | IP 추출 regression | middleware/rate-limit.ts에 `getClientIp()` 통합: `x-forwarded-for` 첫IP → `x-real-ip` → `127.0.0.1` |

### Important 해결

| # | 이슈 | 해결 |
|---|------|------|
| I1 | Rate limit 헤더 누락 | middleware에서 성공 시에도 X-RateLimit-* 헤더 설정: `c.header()` 호출 후 `next()` |
| I2 | Chat 이중 rate limit | chat route에서 `rateLimit('chat_min', 5)` + `rateLimit('chat_day', 100, 86400000)` 2개 middleware 직렬 적용 |
| I3 | 비자명 route 미명세 | auth/anonymous, chat, onboarding, kit, chat/history, events — 각각 별도 명세 추가 |
| I4 | error-handler.ts 미명세 | Hono onError 글로벌 핸들러로 구현: `app.onError((err, c) => c.json({ error: { code: 'INTERNAL_ERROR', ... } }, 500))` |
| I5 | R-5/Composition Root | features/api/routes/ 파일은 Composition Root 코드 (P-4). R-9 미적용. CLAUDE.md에 명시 |
| I6 | catch-all 제약 | app/api/ 하위에 다른 route.ts 불가. 향후 관리자 API도 Hono에서 정의 |

### 비자명 route 상세 (I3)

| route | 특수 로직 | 의존성 |
|-------|---------|--------|
| auth/anonymous | `getClientIp()` IP 추출, endpoint `anon_create`, limit 3/min | `features/auth/service: createAnonymousSession` |
| chat | 이중 rate limit(5/분+100/일), SSE streaming, cross-domain(profile+journey+preferences), `app.post()` 사용 | `features/chat/service: streamChat`, `features/profile/service`, `features/journey/service`, `core/memory`, `shared/constants/ai` |
| onboarding | Q-11 복합 쓰기(profile→journey), Q-13 FK 순서, field 분리 | `features/profile/service: upsertProfile`, `features/journey/service: createOrUpdateJourney` |
| kit/claim | `encrypt`+`hash` 호출, UNIQUE 409, consent UPDATE Q-15 | `core/crypto: encrypt, hash` |
| chat/history | `loadRecentMessages`, tool_calls 제외 mapping, conversation fallback | `core/memory: loadRecentMessages`, `shared/constants/ai: TOKEN_CONFIG` |
| events | per-event metadata validation, fire-and-forget Q-15 | 없음 (직접 INSERT) |

## 원칙 검증 (사전)

| 원칙 | 검증 | 판정 |
|------|------|------|
| P-1 4계층 DAG | app/ → server/ → shared/. Hono도 app/ 계층 | ✅ |
| P-2 Core 불변 | server/core/ 0파일 수정 | ✅ |
| P-3 Last Leaf | Hono route 삭제해도 server/features 무영향 | ✅ |
| P-4 Composition Root | Hono handler가 cross-domain 조합 수행 | ✅ |
| P-5 콜 스택 ≤ 4 | handler→service→tool→repository | ✅ |
| P-7 단일 변경점 | createRoute = 스키마+handler+문서 → 1파일 | ✅↑ |
| P-8 순환 금지 | server→app 역참조 0건 (확인 완료) | ✅ |
| G-2 중복 금지 | 보일러플레이트 ~450줄 → middleware ~70줄 | ✅↑ |

## 수정 범위

### 수정되는 파일 (app/ 계층만)

| 작업 | 파일 |
|------|------|
| **삭제** | 기존 15개 route.ts + 2개 skeleton + 11개 route.test.ts |
| **신규** | `app/api/[[...route]]/route.ts` (Hono 엔트리포인트) |
| **신규** | `server/features/api/` — Hono route 정의 + middleware |

### 절대 수정되지 않는 파일 (50개)

| 계층 | 파일 수 |
|------|--------|
| server/core/ | 8 |
| server/features/ (기존) | 19 |
| shared/ | 21 |
| client/ | 2 |

## 파일 구조

```
src/
├── app/api/[[...route]]/route.ts    ← Hono 엔트리포인트 (GET/POST/PUT export)
│
├── server/features/api/             ← 신규 디렉토리
│   ├── app.ts                       ← OpenAPIHono 앱 생성 + docs 설정
│   ├── middleware/
│   │   ├── auth.ts                  ← authenticateUser / optionalAuth 래핑
│   │   ├── rate-limit.ts            ← checkRateLimit 래핑
│   │   └── error-handler.ts         ← 공통 에러 형식 { error: { code, message, details } }
│   ├── routes/
│   │   ├── auth.ts                  ← POST /api/auth/anonymous
│   │   ├── profile.ts              ← POST onboarding + GET/PUT profile
│   │   ├── chat.ts                  ← POST /api/chat + GET /api/chat/history
│   │   ├── kit.ts                   ← POST /api/kit/claim
│   │   ├── events.ts               ← POST /api/events
│   │   ├── products.ts             ← GET /api/products + GET /api/products/:id
│   │   ├── treatments.ts           ← GET /api/treatments + GET /api/treatments/:id
│   │   ├── stores.ts               ← GET /api/stores + GET /api/stores/:id
│   │   └── clinics.ts              ← GET /api/clinics + GET /api/clinics/:id
│   └── schemas/                     ← 공통 응답 스키마 (에러, 페이지네이션)
│       └── common.ts
```

### 의존성 방향

```
app/api/[[...route]]/route.ts → server/features/api/app.ts (Hono 앱)

server/features/api/routes/*.ts
  ├──→ server/core/ (auth, db, rate-limit, memory, crypto)  ← 기존과 동일
  ├──→ server/features/ (chat, profile, journey, auth, repositories)  ← 기존과 동일
  └──→ shared/ (types, constants)  ← 기존과 동일

server/features/api/middleware/*.ts
  └──→ server/core/ (auth, rate-limit)  ← 기존 route의 import 동일

역방향: 없음
순환: 없음
```

---

## Task 1: 패키지 설치

- [ ] `npm install hono @hono/zod-openapi @hono/swagger-ui`
- [ ] package.json 버전 고정 (Q-9: exact versions)

---

## Task 2: Hono 앱 + middleware + 공통 스키마

**Files:**
- Create: `src/server/features/api/app.ts`
- Create: `src/server/features/api/middleware/auth.ts`
- Create: `src/server/features/api/middleware/rate-limit.ts`
- Create: `src/server/features/api/schemas/common.ts`

### app.ts

```typescript
import 'server-only';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

export function createApp() {
  const app = new OpenAPIHono();

  // OpenAPI JSON
  app.doc('/api/docs/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Essenly K-Beauty API', version: '0.1.0' },
  });

  // Swagger UI
  app.get('/api/docs', swaggerUI({ url: '/api/docs/openapi.json' }));

  return app;
}
```

### middleware/auth.ts

```typescript
import 'server-only';
import { createMiddleware } from 'hono/factory';
import { authenticateUser, optionalAuthenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

// 필수 인증 middleware
export const requireAuth = () => createMiddleware(async (c, next) => {
  try {
    const user = await authenticateUser(c.req.raw);
    c.set('user', user);
    c.set('client', createAuthenticatedClient(user.token));
  } catch {
    return c.json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } }, 401);
  }
  await next();
});

// 선택 인증 middleware (공개 읽기)
export const optionalAuth = () => createMiddleware(async (c, next) => {
  const user = await optionalAuthenticateUser(c.req.raw);
  c.set('user', user);
  c.set('client', user ? createAuthenticatedClient(user.token) : createServiceClient());
  await next();
});
```

### middleware/rate-limit.ts

```typescript
import 'server-only';
import { createMiddleware } from 'hono/factory';
import { checkRateLimit } from '@/server/core/rate-limit';

export const rateLimit = (endpoint: string, limit: number, windowMs = 60000) =>
  createMiddleware(async (c, next) => {
    const user = c.get('user');
    const identifier = user?.id ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const result = checkRateLimit(identifier, endpoint, { limit, windowMs, window: 'minute' });
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return c.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }
    await next();
  });
```

---

## Task 3: Route 마이그레이션 (9개 route 파일)

각 기존 route를 Hono createRoute + app.openapi 패턴으로 변환. **비즈니스 로직 동일, 구문만 변경.**

### routes/stores.ts (예시 — 가장 단순)

```typescript
import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import { optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { findAllStores } from '@/server/features/repositories/store-repository';
import { findStoreById } from '@/server/features/repositories/store-repository';
import type { OpenAPIHono } from '@hono/zod-openapi';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const listRoute = createRoute({
  method: 'get',
  path: '/api/stores',
  middleware: [optionalAuth(), rateLimit('public', 60)],
  request: {
    query: z.object({
      district: z.string().optional(),
      english_support: z.string().optional(),
      store_type: z.string().optional(),
      query: z.string().optional(),
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    }),
  },
  responses: {
    200: { description: 'Store list' },
    400: { description: 'Validation failed' },
    429: { description: 'Rate limited' },
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/api/stores/{id}',
  middleware: [optionalAuth(), rateLimit('public', 60)],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Store detail' },
    404: { description: 'Not found' },
  },
});

export function registerStoreRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const client = c.get('client');
    const { district, english_support, store_type, query: searchQuery } = c.req.valid('query');
    const limit = Math.min(c.req.valid('query').limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = c.req.valid('query').offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    try {
      const { data: rawData, total } = await findAllStores(
        client, { district, english_support, store_type, search: searchQuery, status: 'active' },
        { page, pageSize: limit }, { field: 'created_at', order: 'desc' },
      );
      const data = rawData.map(({ embedding: _e, ...rest }: Record<string, unknown>) => rest);
      return c.json({ data, meta: { total, limit, offset } }, 200);
    } catch (error) {
      console.error('[GET /api/stores] error', String(error));
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve stores', details: null } }, 500);
    }
  });

  app.openapi(detailRoute, async (c) => {
    const client = c.get('client');
    const { id } = c.req.valid('param');

    try {
      const entity = await findStoreById(client, id);
      if (!entity) return c.json({ error: { code: 'NOT_FOUND', message: 'Store not found', details: null } }, 404);
      const { embedding: _e, ...rest } = entity as Record<string, unknown>;
      return c.json({ data: rest }, 200);
    } catch (error) {
      console.error('[GET /api/stores/:id] error', String(error));
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve store', details: null } }, 500);
    }
  });
}
```

나머지 8개 route 파일도 동일 패턴. 비즈니스 로직은 기존 route에서 그대로 복사.

---

## Task 4: Hono 엔트리포인트 + 기존 route 삭제

- [ ] Create: `src/app/api/[[...route]]/route.ts`
- [ ] Delete: 기존 15개 route.ts + 2개 skeleton

### 엔트리포인트

```typescript
import { createApp } from '@/server/features/api/app';
import { registerAuthRoutes } from '@/server/features/api/routes/auth';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';
import { registerChatRoutes } from '@/server/features/api/routes/chat';
import { registerKitRoutes } from '@/server/features/api/routes/kit';
import { registerEventRoutes } from '@/server/features/api/routes/events';
import { registerProductRoutes } from '@/server/features/api/routes/products';
import { registerTreatmentRoutes } from '@/server/features/api/routes/treatments';
import { registerStoreRoutes } from '@/server/features/api/routes/stores';
import { registerClinicRoutes } from '@/server/features/api/routes/clinics';

const app = createApp();

registerAuthRoutes(app);
registerProfileRoutes(app);
registerChatRoutes(app);
registerKitRoutes(app);
registerEventRoutes(app);
registerProductRoutes(app);
registerTreatmentRoutes(app);
registerStoreRoutes(app);
registerClinicRoutes(app);

export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
```

---

## Task 5: 테스트 재작성

기존 11개 route.test.ts를 Hono `app.request()` 패턴으로 재작성. assertion 내용 동일.

---

## Task 6: 전체 검증

- [ ] `npx vitest run` — 전체 통과
- [ ] `GET /api/docs` — Swagger UI 표시 확인
- [ ] server/core/features/shared 파일 diff 0건 확인
- [ ] Commit

---

## 검증 체크리스트

```
[ ] server/core/ 0파일 수정 (P-2)
[ ] server/features/ 기존 파일 0수정 (P-3)
[ ] shared/ 0파일 수정
[ ] client/ 0파일 수정
[ ] 역참조: server→app 0건 (P-8)
[ ] 콜 스택 ≤ 4 (P-5)
[ ] createRoute = 스키마+handler+문서 통합 (P-7)
[ ] middleware: 보일러플레이트 중복 제거 (G-2)
[ ] OpenAPI 자동 생성 확인
[ ] 기존 229개 비-route 테스트 전부 통과 (regression 없음)
```
