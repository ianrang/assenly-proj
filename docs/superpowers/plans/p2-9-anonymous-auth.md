# P2-9: Anonymous 인증 서비스 + API 구현 계획

**Goal:** MVP 사용자 앱 인증 기반 전체 구축 — 익명 세션 생성 + 동의 기록 + 세션 검증 미들웨어.

**Architecture:** 3개 파일 — `core/auth.ts`(세션 검증 미들웨어), `features/auth/service.ts`(세션 생성 비즈니스), `app/api/auth/anonymous/route.ts`(thin route). P-4 Composition Root 패턴.

**Tech Stack:** @supabase/supabase-js, Vitest, zod

---

## 설계 근거

- api-spec.md §2.1: `POST /api/auth/anonymous` 요청/응답 스키마, 201 응답
- api-spec.md §1.1~§1.7: 공통 규격 (응답 형식, 에러 코드, Rate Limit 헤더)
- api-spec.md §4.1: Rate limit — `POST /api/auth/anonymous` 3회/분, IP 기준
- auth-matrix.md §1.3~§1.5: 인증 아키텍처, DB 클라이언트 전략, core/ 모듈 구조
- auth-matrix.md §2.4: 엔드포인트별 권한 매핑 — `/api/auth/anonymous` = 공개
- auth-matrix.md §3.2: authenticateUser/optionalAuthenticateUser 시그니처
- auth-matrix.md §3.3: API Route 코드 패턴
- data-privacy.md §1.2: Landing → 세션 생성 흐름, consent 수집 구현
- schema.dbml: users(id, auth_method, last_active), consent_records(user_id, data_retention, ...)
- PoC P0-26: signInAnonymously() 검증 완료 (test-anon-auth.ts)
- CLAUDE.md: L-0a, L-1, L-4, L-5, L-14, P-2, P-4, P-7, P-8, G-8, G-9, Q-1, Q-7, R-3, R-5

## 파일 구조

```
src/server/core/
  ├── auth.ts           <- CREATE (L-4 승인 필요): 세션 검증 미들웨어
  └── auth.test.ts      <- CREATE: 미들웨어 테스트

src/server/features/auth/
  ├── service.ts        <- MODIFY (스켈레톤 -> 구현): 익명 세션 생성
  └── service.test.ts   <- CREATE: 서비스 테스트

src/app/api/auth/anonymous/
  └── route.ts          <- CREATE: POST 핸들러 (thin route)
  └── route.test.ts     <- CREATE: 라우트 테스트
```

## 의존성 방향

```
[app/api/auth/anonymous/route.ts]
  -> server/features/auth/service.ts     (L-1: route -> service)
  -> server/core/rate-limit.ts           (이미 구현, P2-5a)
  -> zod                                 (Q-1: 입력 검증)

[server/features/auth/service.ts]
  -> server/core/db.ts (createServiceClient)  (R-5: features -> core 허용)
  -> @supabase/supabase-js                    (signInAnonymously)

[server/core/auth.ts]
  -> server/core/config.ts (env: SUPABASE_URL, ANON_KEY — Q-8 준수)
  -> @supabase/supabase-js (createClient + getUser: 토큰 검증 전용)
  -> (route.ts, service.ts와 상호 import 없음)

역방향 없음:
core/auth.ts    -> features/  X (R-3)
core/auth.ts    -> core/db.ts X (불필요 -- token 검증만, createClient 직접 사용)
core/db.ts      -> core/auth.ts X
core/config.ts  -> core/auth.ts X
service.ts      -> route.ts  X (P-1: 역방향 금지)
shared/         -> server/   X (R-4)
```

## 범위 한정

| 포함 | 제외 |
|------|------|
| `createAnonymousSession()` — 익명 세션 생성 + 동의 기록 | 계정 인증 (v0.2 user role) |
| `authenticateUser(req)` — Supabase JWT 검증 | `authenticateAdmin(req)` (P2-27 관리자 인증) |
| `optionalAuthenticateUser(req)` — 비인증 허용 | `createAnonClient()` (MVP 사용 경로 없음) |
| `POST /api/auth/anonymous` route + Rate limit | 세션 복구 (Supabase SDK 자동 처리) |
| consent_records INSERT (data_retention) | marketing 동의 (P2-25 Kit CTA) |
| 공통 응답 형식 (meta.timestamp, 에러 구조) | `last_active` 갱신 (별도 태스크 — 90일 만료 관련) |
| X-RateLimit-* 헤더 (모든 응답) | `createAnonClient()` (MVP 사용 경로 없음) |

---

## Task 1: features/auth/service.ts (서비스)

**Files:**
- Modify: `src/server/features/auth/service.ts`
- Create: `src/server/features/auth/service.test.ts`

### Step 1: 테스트 작성

테스트 케이스 (설계 문서 기반 도출):

1. **createAnonymousSession**: 정상 — signInAnonymously 성공 -> users INSERT -> consent_records INSERT -> `{ user_id, session_token }` 반환
2. **createAnonymousSession**: data_retention=false -> 에러 (필수 동의)
3. **createAnonymousSession**: signInAnonymously 실패 -> throw (Q-7)
4. **createAnonymousSession**: users INSERT 실패 -> throw (Q-7)
5. **createAnonymousSession**: consent_records INSERT 실패 -> throw (Q-7)
6. **createAnonymousSession**: signInAnonymously 반환값에 user/session 누락 -> throw

Mock 전략:
- `@supabase/supabase-js`의 `createClient` mock
- `signInAnonymously()` 반환값 mock
- `from('users').insert()`, `from('consent_records').insert()` mock
- `server-only` mock

```typescript
// service.ts 내부 타입 (L-14: export 안 함)
interface ConsentInput {
  data_retention: boolean;
}

interface AnonymousSessionResult {
  user_id: string;
  session_token: string;
}
```

구현 흐름 (api-spec.md §2.1 + data-privacy.md §1.2):
```typescript
export async function createAnonymousSession(
  consent: ConsentInput,
): Promise<AnonymousSessionResult>
// 1. consent.data_retention === false -> throw (필수 동의)
// 2. createServiceClient()로 Supabase 클라이언트 생성
// 3. client.auth.signInAnonymously() -> user.id, session.access_token
// 4. client.from('users').insert({ id: user.id, auth_method: 'anonymous' })
// 5. client.from('consent_records').insert({ user_id: user.id, data_retention: true })
// 6. return { user_id, session_token }
```

> **핵심**: PoC P0-26에서 검증된 패턴 — signInAnonymously()는 Supabase Auth에 사용자를 생성하지만, `users` 테이블(우리 앱 테이블)에는 service_role로 별도 INSERT 필요. Supabase Auth의 `auth.users`와 앱의 `public.users`는 별개.

### Step 2: 테스트 실패 확인

```bash
npx vitest run src/server/features/auth/service.test.ts
```
Expected: FAIL (스켈레톤만 존재)

### Step 3: service.ts 구현

```typescript
import 'server-only';
import { createServiceClient } from '@/server/core/db';

// G-9: export 1개만 (createAnonymousSession)
// L-14: ConsentInput, AnonymousSessionResult export 안 함

export async function createAnonymousSession(
  consent: ConsentInput,
): Promise<AnonymousSessionResult> {
  if (!consent.data_retention) {
    throw new Error('data_retention consent is required');
  }

  const client = createServiceClient();

  // Supabase Auth: 익명 사용자 생성
  const { data: authData, error: authError } = await client.auth.signInAnonymously();
  // Q-7: 에러 불삼킴. 단, Supabase 내부 메시지는 노출하지 않음 (E-4 보안).
  // route에서 catch하여 제네릭 에러 메시지로 변환.
  if (authError) throw new Error('Anonymous sign-in failed');
  if (!authData.user || !authData.session) {
    throw new Error('Anonymous sign-in failed');
  }

  const userId = authData.user.id;
  const sessionToken = authData.session.access_token;

  // 앱 users 테이블 INSERT (service_role)
  // 보안 근거: signInAnonymously()는 auth.users에 생성하지만 public.users에는 RLS 때문에
  // 새 사용자가 직접 INSERT 불가 (chicken-and-egg). service_role 사용이 정당.
  // schema.dbml: created_at, last_active는 default now() 처리.
  const { error: userError } = await client
    .from('users')
    .insert({ id: userId, auth_method: 'anonymous' });
  if (userError) throw new Error('User record creation failed');

  // consent_records INSERT
  // schema.dbml: consented_at, updated_at는 default now(). 나머지 boolean은 default false.
  const { error: consentError } = await client
    .from('consent_records')
    .insert({ user_id: userId, data_retention: true });
  if (consentError) throw new Error('Consent record creation failed');

  return { user_id: userId, session_token: sessionToken };
}
```

### Step 4: 테스트 통과 확인
### Step 5: 커밋 (service만)

```bash
git add src/server/features/auth/
git commit -m "P2-9a: features/auth/service.ts -- 익명 세션 생성 + 동의 기록 + 테스트"
```

---

## Task 2: app/api/auth/anonymous/route.ts (API 라우트)

**Files:**
- Create: `src/app/api/auth/anonymous/route.ts`
- Create: `src/app/api/auth/anonymous/route.test.ts` (또는 service 테스트에 통합)

### Step 6: 테스트 작성

테스트 케이스:

1. **POST 정상**: consent.data_retention=true -> 201 + `{ data: { user_id, session_token }, meta: { timestamp } }` + X-RateLimit-* 헤더
2. **POST 검증 실패**: consent 누락 -> 400 + `{ error: { code: 'VALIDATION_FAILED', message: '...', details: null } }`
3. **POST 검증 실패**: data_retention=false -> 400 + 동일 에러 구조
4. **POST Rate limit 초과**: 3회 초과 -> 429 + `{ error: { code: 'RATE_LIMIT_EXCEEDED', message: '...', details: { retryAfter } } }` + Retry-After 헤더
5. **POST 서비스 에러**: service throw -> 500 + `{ error: { code: 'AUTH_SESSION_CREATION_FAILED', message: 'Failed to create session', details: null } }` (내부 에러 메시지 노출 금지)
6. **POST 정상 응답 헤더**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset 포함 확인
7. **POST 비JSON 요청**: Content-Type 누락 또는 malformed JSON -> 400

라우트 구조 (api-spec.md §1.7 패턴):
```typescript
import { checkRateLimit } from '@/server/core/rate-limit';
import { createAnonymousSession } from '@/server/features/auth/service';

// Q-1: zod 스키마 (route 파일 내부 정의 -- shared/에 넣을 필요 없음)
const anonymousAuthSchema = z.object({
  consent: z.object({
    data_retention: z.literal(true, {
      errorMap: () => ({ message: 'data_retention consent is required' }),
    }),
  }),
});

export async function POST(req: Request) {
  // 1. IP 추출: x-forwarded-for(첫 IP) -> x-real-ip -> 'unknown' 폴백
  // 2. Rate limit (IP 기준, 3회/분) -- api-spec.md §4.1
  //    -> 429 시: { error: { code, message, details: { retryAfter } } } + Retry-After 헤더
  // 3. 입력 검증 (zod) -- Q-1
  //    -> 400 시: { error: { code: 'VALIDATION_FAILED', message, details: null } }
  // 4. service 호출 -- L-1 thin route
  //    -> catch: { error: { code: 'AUTH_SESSION_CREATION_FAILED', message: 'Failed to create session', details: null } }
  //    -> 내부 에러 메시지는 로그에만 기록, 클라이언트에 노출 금지
  // 5. 201 응답: { data: { user_id, session_token }, meta: { timestamp } }
  // 6. 모든 응답에 X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset 헤더 포함
}
```

> **Rate limit IP 추출**: `x-forwarded-for` 헤더의 첫 번째 IP (Vercel이 설정, 신뢰 가능) -> `x-real-ip` 폴백 -> 개발 환경에서는 `'127.0.0.1'` 폴백. 다중 IP의 경우 `split(',')[0].trim()` 으로 클라이언트 IP 추출.

### Step 7: 테스트 실패 확인
### Step 8: route.ts 구현
### Step 9: 테스트 통과 확인
### Step 10: 커밋

```bash
git add src/app/api/auth/anonymous/
git commit -m "P2-9b: POST /api/auth/anonymous -- 익명 세션 생성 API + Rate limit + 테스트"
```

---

## Task 3: server/core/auth.ts (인증 미들웨어)

**L-4 승인 필요: core/ 새 파일 추가**

**Files:**
- Create: `src/server/core/auth.ts`
- Create: `src/server/core/auth.test.ts`

### Step 11: 테스트 작성

테스트 케이스 (auth-matrix.md §3.2 시그니처 기반):

**authenticateUser:**
1. 정상: Authorization Bearer 토큰 -> `{ id, token }` 반환
2. Authorization 헤더 없음 -> throw (401)
3. Bearer 접두사 없음 -> throw (401)
4. 토큰이 빈 문자열 -> throw (401)
5. Supabase getUser 실패 (만료/무효) -> throw (401)

**optionalAuthenticateUser:**
6. 정상: 토큰 있음 -> `{ id, token }` 반환
7. 토큰 없음 -> `null` 반환 (에러 아님)
8. 토큰 있지만 무효 -> throw (401) (토큰을 보냈는데 무효면 에러)

구현 (auth-matrix.md §3.2):
```typescript
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from './config';  // Q-8: env는 config.ts 경유

// L-5: K-뷰티 비즈니스 용어 없음
// L-14: AuthenticatedUser export 안 함 (내부 타입)
// G-9: export 2개만 (authenticateUser, optionalAuthenticateUser)

interface AuthenticatedUser {
  id: string;     // Supabase Auth UUID
  token: string;  // Supabase session access_token
}

export async function authenticateUser(req: Request): Promise<AuthenticatedUser>
// 1. Authorization header에서 Bearer token 추출
// 2. Supabase createClient(url, anonKey) + getUser(token)으로 검증
// 3. 실패 시 throw Error (route에서 401 변환)

export async function optionalAuthenticateUser(req: Request): Promise<AuthenticatedUser | null>
// 1. Authorization header 없으면 null 반환
// 2. header 있으면 authenticateUser 위임
```

> **env 접근 방식**: auth.ts는 config.ts의 env를 import하여 SUPABASE_URL, ANON_KEY 사용 (Q-8 준수). `createClient`로 임시 클라이언트를 만들어 `getUser(token)` 호출. 이 클라이언트는 DB 접근용이 아니라 토큰 검증 전용.

### Step 12: 테스트 실패 확인
### Step 13: auth.ts 구현
### Step 14: 테스트 통과 확인
### Step 15: 전체 테스트 확인

```bash
npx vitest run
```
Expected: 기존 + 신규 모두 PASS

### Step 16: 커밋

```bash
git add src/server/core/auth.ts src/server/core/auth.test.ts
git commit -m "P2-9c: server/core/auth.ts -- authenticateUser + optionalAuthenticateUser + 테스트"
```

---

## 실행 순서 근거

```
Task 1 (service) -> Task 2 (route) -> Task 3 (auth middleware)

의존성:
  route.ts --import--> service.ts      (Task 2는 Task 1에 의존)
  route.ts --import--> rate-limit.ts   (이미 존재)
  auth.ts  --import--> config.ts       (env 참조, Q-8. 독립적 — route/service와 무관)

auth.ts를 마지막에 배치하는 이유:
  1. POST /api/auth/anonymous는 auth.ts를 사용하지 않음 (공개 엔드포인트)
  2. auth.ts의 소비자는 P2-10+ (프로필 API부터)
  3. service + route를 먼저 완성하면 즉시 E2E 검증 가능
```

---

## 완료 후 검증 체크리스트

### core/auth.ts
```
[ ] L-0a   import 'server-only' 첫 줄
[ ] L-4    core/ 추가 승인 표시
[ ] L-5    K-뷰티 비즈니스 용어 없음 (id, token만)
[ ] L-14   AuthenticatedUser 타입 export 안 함
[ ] P-2    Core 불변: 비즈니스 무관 JWT 검증 유틸
[ ] P-7    단일 변경점: 인증 검증 = auth.ts 1파일
[ ] P-8    순환 없음: config.ts -> auth.ts 단방향. db.ts, features/ import 없음
[ ] G-8    any 타입 없음
[ ] G-9    export 2개만 (authenticateUser, optionalAuthenticateUser)
[ ] Q-7    에러 불삼킴: 검증 실패 시 throw
[ ] Q-8    env는 config.ts 경유
[ ] R-3    core -> features import 없음
```

### features/auth/service.ts
```
[ ] L-0a   import 'server-only' 첫 줄
[ ] L-14   ConsentInput, AnonymousSessionResult export 안 함
[ ] R-5    features -> core (createServiceClient) 허용 import만 사용
[ ] R-9    타 도메인 import 없음
[ ] P-4    createServiceClient()로 DB 접근 (Composition Root 패턴)
[ ] P-5    콜 스택 <= 4: route -> service -> Supabase SDK (3단계)
[ ] P-7    단일 변경점: 세션 생성 = service.ts 1파일
[ ] G-8    any 타입 없음
[ ] G-9    export 1개만 (createAnonymousSession)
[ ] Q-7    에러 불삼킴: Auth/DB 에러 모두 throw
```

### app/api/auth/anonymous/route.ts
```
[ ] L-1    thin route: 검증 -> service 호출 -> 응답 (직접 로직 없음)
[ ] P-1    app/ -> server/ 방향만 import
[ ] P-4    cross-domain 데이터 없음 (단일 서비스 호출)
[ ] Q-1    zod 스키마로 입력 검증
[ ] api-spec §1.1  성공 응답: { data: { user_id, session_token }, meta: { timestamp } }
[ ] api-spec §1.1  에러 응답: { error: { code, message, details } } — 3필드 모두 포함
[ ] api-spec §1.2  상태 코드: 201(성공), 400(검증), 429(Rate limit), 500(에러)
[ ] api-spec §1.3  에러 코드: VALIDATION_FAILED, RATE_LIMIT_EXCEEDED, AUTH_SESSION_CREATION_FAILED
[ ] api-spec §1.6  X-RateLimit-* 헤더: 모든 응답(성공+에러)에 포함
[ ] api-spec §4.1  Rate limit: 3회/분, IP 기준
[ ] 보안     내부 에러 메시지(Supabase 등) 클라이언트 노출 금지 — 제네릭 메시지만 반환
[ ] N-2      파일명 kebab-case (route.ts, service.ts, auth.ts)
[ ] Q-4      TypeScript strict 모드 준수
```

### 의존성 방향 검증
```
[ ] V-1    DAG 준수: app/ -> features/ -> core/ -> shared/
[ ] V-2    core 불변: auth.ts는 비즈니스 무관
[ ] V-4    features 독립: auth/service.ts -> 타 도메인 import 없음
[ ] V-9    중복 없음: 기존 코드에 유사 구현 없음
[ ] V-10   불필요 코드 없음: 모든 export에 소비자 존재
[ ] V-17   제거 안전성: 3개 파일 모두 삭제해도 기존 코드 빌드 에러 없음
[ ] P-10   역참조 0건: core/auth.ts를 import하는 기존 파일 없음
```
