# 권한 체계 설계 — P1-13 / P1-14 / P1-15

> 버전: 1.2
> 작성일: 2026-03-22
> 상위: MASTER-PLAN Phase 1, TODO P1-13~P1-15
> 근거: PRD §4-C, P0-4~6 (7.2-ADMIN-REQUIREMENTS.md), TDD v2.0 §6, PoC P0-26

---

## 1. 역할 정의 (P1-13)

### 1.1 MVP 역할

| 역할 | 시스템 | 인증 방식 | 설명 |
|------|--------|----------|------|
| `anonymous` | 사용자 앱 | Supabase anonymous auth | 계정 없이 서비스 이용. UUID 기반 세션 |
| `admin` | 관리자 앱 | Google Workspace SSO → 자체 JWT | super_admin이 등록한 이메일만 접근. 엔티티별 read/write 권한 |
| `super_admin` | 관리자 앱 | Google Workspace SSO → 자체 JWT | 모든 권한 + admin 계정 관리 + 감사 로그 조회 |

### 1.2 v0.2+ 역할 (참고)

| 역할 | 시스템 | 설명 |
|------|--------|------|
| `user` | 사용자 앱 | 계정 인증 사용자 (이메일/소셜) |
| `partner` | 제휴업체 앱 | 자사 데이터 셀프서비스 |

### 1.3 인증 아키텍처 (옵션 B)

```
┌── 사용자 앱 ────────────────────────────────────────┐
│  signInAnonymously() → Supabase Auth → session token │
│  fetch('/api/*', { Authorization: Bearer <token> })   │
└──────────────────────┬────────────────────────────────┘
                       │
┌── 관리자 앱 ─────────│────────────────────────────────┐
│  Google SSO → /api/admin/auth/login → 자체 JWT 발급   │
│  fetch('/api/admin/*', { Authorization: Bearer <jwt> })│
└──────────────────────┬────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────┐
│  Next.js API Routes                                    │
│                                                        │
│  /api/*        → authenticateUser()                    │
│                  → createAuthenticatedClient(token)     │
│                  → RLS 적용                             │
│                                                        │
│  /api/admin/*  → authenticateAdmin()                   │
│                  → checkPermission(resource, action)    │
│                  → createServiceClient()                │
│                  → RLS 우회                             │
└──────────────────────┬────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────┐
│  Supabase PostgreSQL                                   │
│  RLS = 사용자 데이터 2차 방어선 (defense-in-depth)      │
│  service_role = 관리자/비동기 전용                      │
└───────────────────────────────────────────────────────┘
```

### 1.4 DB 클라이언트 전략

| 경로 | 클라이언트 | RLS | 용도 |
|------|-----------|-----|------|
| `/api/*` (사용자, 동기) | `createAuthenticatedClient(token)` | ✅ 적용 | 사용자 데이터 R/W + 도메인 데이터 R |
| `/api/admin/*` (관리자) | `createServiceClient()` | ❌ 우회 | 도메인 데이터 CRUD + 관리 |
| 비동기 후처리 | `createServiceClient()` | ❌ 우회 | 행동 로그, 선호도 갱신 (user_id 필수 파라미터) |

### 1.5 core/ 모듈 구조

```
server/core/
├── db.ts             # createAuthenticatedClient(token), createServiceClient()
├── auth.ts           # authenticateUser(req) → { id, token }
├── admin-auth.ts     # authenticateAdmin(req) → { id, role, permissions }
└── config.ts         # 환경변수 관리
```

- `db.ts`: SupabaseClient 팩토리. 2개 패턴만 제공
- `auth.ts`: Supabase session 검증 → user_id + token 반환
- `admin-auth.ts`: 자체 JWT 검증 + 권한 확인 → admin 정보 반환

---

## 2. 권한 매트릭스 (P1-14)

### 2.1 사용자 앱 리소스 권한

| 리소스 | anonymous | 비고 |
|--------|-----------|------|
| 도메인 데이터 (products, stores, clinics, treatments, brands, ingredients, doctors) | **Read** | RLS `USING (true)` |
| users (본인) | **Read** | RLS `auth.uid() = id` |
| user_profiles (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| journeys (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| conversations (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| messages (본인) | **Read / Write** | RLS via conversation ownership |
| beauty_history (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| learned_preferences (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| consent_records (본인) | **Read / Write** | RLS `auth.uid() = user_id` |
| behavior_logs (본인) | **Write** (Read: 서버만) | RLS INSERT only |
| 타인 데이터 | **없음** | RLS가 차단 |

### 2.2 관리자 앱 리소스 권한

| 리소스 | super_admin | admin | 비고 |
|--------|-------------|-------|------|
| Product | Read + Write | **권한 비트별** | write = 생성/수정/비활성화/하이라이트 |
| Store | Read + Write | 권한 비트별 | |
| Brand | Read + Write | 권한 비트별 | |
| Ingredient | Read + Write | 권한 비트별 | |
| Clinic | Read + Write | 권한 비트별 | |
| Treatment | Read + Write | 권한 비트별 | |
| Doctor | Read + Write | 권한 비트별 | |
| product_stores | Read + Write | Product write **또는** Store write | |
| product_ingredients | Read + Write | Product write **또는** Ingredient write | |
| clinic_treatments | Read + Write | Clinic write **또는** Treatment write | |
| Admin 계정 관리 | **전용** | 없음 | 생성/비활성화/권한 변경 |
| 감사 로그 | **Read 전용** | 없음 | 불변, 조회만 |
| 데이터 동기화 | **전용** | 없음 | 주기 설정 + 트리거 |

### 2.3 권한 비트 구조 (14 비트)

```typescript
// shared/types/auth.ts
interface AdminPermissions {
  product_read: boolean;
  product_write: boolean;
  store_read: boolean;
  store_write: boolean;
  brand_read: boolean;
  brand_write: boolean;
  ingredient_read: boolean;
  ingredient_write: boolean;
  clinic_read: boolean;
  clinic_write: boolean;
  treatment_read: boolean;
  treatment_write: boolean;
  doctor_read: boolean;
  doctor_write: boolean;
}
```

### 2.4 API 엔드포인트별 권한 매핑

**사용자 앱 API**

| 엔드포인트 | 메서드 | 인증 | 권한 |
|-----------|--------|------|------|
| `/api/auth/anonymous` | POST | 없음 | 공개 |
| `/api/products` | GET | 선택 | 공개 읽기 |
| `/api/products/:id` | GET | 선택 | 공개 읽기 |
| `/api/treatments` | GET | 선택 | 공개 읽기 |
| `/api/treatments/:id` | GET | 선택 | 공개 읽기 |
| `/api/stores` | GET | 선택 | 공개 읽기 |
| `/api/stores/:id` | GET | 선택 | 공개 읽기 |
| `/api/clinics` | GET | 선택 | 공개 읽기 |
| `/api/clinics/:id` | GET | 선택 | 공개 읽기 |
| `/api/profile` | GET | 필수 | 본인만 |
| `/api/profile` | PUT | 필수 | 본인만 |
| `/api/profile/onboarding` | POST | 필수 | 본인만 |
| `/api/journey` | POST | 필수 | 본인만 |
| `/api/journey/active` | GET | 필수 | 본인만 |
| `/api/chat` | POST | 필수 | 본인만 |
| `/api/chat/history` | GET | 필수 | 본인만 |
| `/api/kit/claim` | POST | 필수 | 본인만 |
| `/api/events` | POST | 필수 | 본인만 |

**관리자 앱 API**

| 엔드포인트 | 메서드 | 인증 | 권한 |
|-----------|--------|------|------|
| `/api/admin/auth/login` | POST | Google OAuth | 등록된 이메일 |
| `/api/admin/auth/me` | GET | JWT | 인증된 admin |
| `/api/admin/products` | GET | JWT | product_read |
| `/api/admin/products` | POST | JWT | product_write |
| `/api/admin/products/:id` | PUT | JWT | product_write |
| `/api/admin/products/:id` | DELETE | JWT | product_write |
| `/api/admin/stores` | GET/POST/PUT/DELETE | JWT | store_read / store_write |
| `/api/admin/clinics` | GET/POST/PUT/DELETE | JWT | clinic_read / clinic_write |
| `/api/admin/treatments` | GET/POST/PUT/DELETE | JWT | treatment_read / treatment_write |
| `/api/admin/brands` | GET/POST/PUT/DELETE | JWT | brand_read / brand_write |
| `/api/admin/ingredients` | GET/POST/PUT/DELETE | JWT | ingredient_read / ingredient_write |
| `/api/admin/doctors` | GET/POST/PUT/DELETE | JWT | doctor_read / doctor_write |
| `/api/admin/users` | GET/POST/PUT | JWT | **super_admin 전용** |
| `/api/admin/users/:id/deactivate` | PUT | JWT | **super_admin 전용** |
| `/api/admin/users/:id/reactivate` | PUT | JWT | **super_admin 전용** |
| `/api/admin/auth/refresh` | POST | JWT | 인증된 admin |
| `/api/admin/auth/logout` | POST | JWT | 인증된 admin |
| `/api/admin/relations/{type}` | POST/DELETE | JWT | 양쪽 엔티티의 write 권한 (§2.2) |
| `/api/admin/{entity}/:id/highlight` | PUT | JWT | {entity}_write |
| `/api/admin/{entity}/:id/images` | POST/DELETE | JWT | {entity}_write |
| `/api/admin/{entity}/:id/images/order` | PUT | JWT | {entity}_write |
| `/api/admin/audit-logs` | GET | JWT | **super_admin 전용** |
| `/api/admin/sync` | POST/GET | JWT | **super_admin 전용** · v0.2 (V2-2) |

> 서브 엔드포인트(relations, highlight, images)는 상위 엔티티의 write 권한을 따른다. 상세 스키마는 api-spec.md §5.2~§5.4 참조.

---

## 3. 라우트 보호 설계 (P1-15)

### 3.1 미들웨어 레이어

```
요청 진입
  │
  ├─ /api/admin/* ──→ adminAuthMiddleware
  │                    ├─ JWT 검증 (서명, 만료)
  │                    ├─ admin 테이블에서 활성 상태 확인
  │                    ├─ permissions 로드
  │                    └─ req에 admin 정보 첨부
  │                         │
  │                    permissionGuard(resource, action)
  │                    ├─ super_admin → 전체 허용
  │                    ├─ admin → permissions[resource_action] 확인
  │                    └─ 거부 시 403 + 감사 로그
  │
  ├─ /api/* (사용자) ──→ userAuthMiddleware
  │                    ├─ Authorization header에서 Supabase token 추출
  │                    ├─ Supabase Auth로 세션 검증
  │                    ├─ user_id 추출
  │                    └─ req에 user 정보 첨부
  │                    (인증 필수 경로만 적용. /api/products 등은 선택적)
  │
  └─ /api/auth/anonymous ──→ 미들웨어 없음 (공개)
```

### 3.2 인증 함수 시그니처

```typescript
// server/core/auth.ts
interface AuthenticatedUser {
  id: string;        // Supabase Auth UUID
  token: string;     // Supabase session access_token
}

async function authenticateUser(req: Request): Promise<AuthenticatedUser>
// 실패 시: 401 Unauthorized throw

async function optionalAuthenticateUser(req: Request): Promise<AuthenticatedUser | null>
// 비인증 허용 (도메인 데이터 공개 읽기)
```

```typescript
// server/core/admin-auth.ts
interface AuthenticatedAdmin {
  id: string;        // admin_users 테이블 ID
  email: string;
  role: 'super_admin' | 'admin';
  permissions: AdminPermissions;  // 14개 비트
}

async function authenticateAdmin(req: Request): Promise<AuthenticatedAdmin>
// 실패 시: 401 Unauthorized throw

function checkPermission(admin: AuthenticatedAdmin, resource: string, action: 'read' | 'write'): void
// 실패 시: 403 Forbidden throw + 감사 로그
```

### 3.3 API Route 코드 패턴

```typescript
// 사용자 앱: 인증 필수 (프로필 수정)
export async function PUT(req: Request) {
  const user = await authenticateUser(req);                    // 401 if fail
  const client = createAuthenticatedClient(user.token);        // RLS 적용
  const body = await validateBody(req, profileUpdateSchema);   // zod 검증
  const result = await profileService.update(client, user.id, body);
  return Response.json(result);
}

// 사용자 앱: 인증 선택 (도메인 데이터 공개 읽기)
export async function GET(req: Request) {
  const user = await optionalAuthenticateUser(req);
  const client = user
    ? createAuthenticatedClient(user.token)
    : createAnonClient();
  const result = await productService.list(client, parseFilters(req));
  return Response.json(result);
}

// 관리자 앱: JWT + 권한 확인
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await authenticateAdmin(req);                  // 401 if fail
  checkPermission(admin, 'product', 'write');                  // 403 if fail
  const client = createServiceClient();                        // RLS 우회
  const body = await validateBody(req, productUpdateSchema);
  const result = await productService.update(client, params.id, body);
  await auditLogService.record(client, admin.id, 'product.update', params.id, body);
  return Response.json(result);
}
```

### 3.4 Next.js 미들웨어 (라우트 레벨 보호)

```typescript
// src/middleware.ts (기존 i18n + 추가)
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 관리자 경로: JWT 쿠키/헤더 존재 확인 (상세 검증은 API Route에서)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // 사용자 앱: i18n 라우팅 (기존)
  // ...
}
```

### 3.5 RLS 정책 역할 정의 (defense-in-depth)

현재 `001_initial_schema.sql`의 RLS 정책을 **유지**. 역할 변경:

| 정책 | 기존 역할 | 옵션 B 역할 |
|------|----------|-----------|
| `auth.uid() = user_id` | 주 방어선 | **2차 방어선** (API가 1차) |
| `USING (true)` 공개 읽기 | 주 접근 경로 | **2차 방어선** (API가 1차) |

추가 정책 (안전망 강화):

```sql
-- users 테이블 INSERT: 서버에서만 생성 (anonymous는 INSERT 불가)
-- 현재 정책 없음 = RLS가 차단 → 의도된 동작 (service_role만 INSERT)
-- ↑ 추가 정책 불필요. 현재 상태가 올바름.
```

### 3.6 보안 체크리스트

```
□ 모든 /api/admin/* 라우트에 authenticateAdmin + checkPermission 적용
□ 모든 /api/* 사용자 쓰기 라우트에 authenticateUser 적용
□ service_role 키는 server/ 파일에서만 사용 (import 'server-only')
□ 관리자 JWT secret은 환경변수로만 관리
□ 비동기 후처리에서 user_id 필수 파라미터 (TypeScript 강제)
□ 감사 로그: 모든 관리자 write 작업 + 권한 거부 기록
□ RLS 정책 유지 (defense-in-depth)
```

---

## 4. 관련 문서 동기화 항목

### TDD v2.0

| 섹션 | 변경 필요 | 내용 |
|------|----------|------|
| §3.7 Chat API 플로우 | ⚠️ 수정 | `authenticateUser` + `createAuthenticatedClient` 패턴 반영 |
| §6 기술 결정 로그 | ⚠️ 추가 | 옵션 B 결정 기록 |

### CLAUDE.md

| 섹션 | 변경 필요 | 내용 |
|------|----------|------|
| §3 L-1 | 확인 | auth middleware 호출이 "thin" 범위 내 — 변경 불필요 |
| - | ⚠️ 추가 | `server/core/db.ts` 클라이언트 패턴 규칙 (2개 패턴) |

### 7.2-ADMIN-REQUIREMENTS.md

| 섹션 | 변경 필요 | 내용 |
|------|----------|------|
| §7.2.3 인증 | ✅ 이미 일치 | Google SSO + JWT 24h — 변경 불필요 |
| §7.2.1 권한 | ✅ 이미 일치 | 14개 권한 비트 — 변경 불필요 |

### PRD

| 섹션 | 변경 필요 | 내용 |
|------|----------|------|
| §4-C | ✅ 이미 일치 | anonymous만, 변경 불필요 |

### schema.dbml

| 변경 필요 | 내용 |
|----------|------|
| ✅ 반영 완료 | admin_users + audit_logs 테이블이 schema.dbml v2.0에 정의됨 |

---

## 5. 구현 상세 (P1-49 보완)

> §1~§4에서 정의한 아키텍처의 구현 수준 상세. 구현자가 이 섹션만으로 코드를 작성할 수 있는 것을 목표로 한다.

### 5.1 JWT 클레임 구조

#### 관리자 JWT 페이로드

```typescript
interface AdminJwtPayload {
  // 표준 클레임 (RFC 7519)
  sub: string;        // admin_users.id (uuid)
  iat: number;        // 발급 시각 (Unix timestamp)
  exp: number;        // 만료 시각 (iat + 24h)
  iss: string;        // 'essenly-admin'

  // 커스텀 클레임
  email: string;      // admin_users.email
  role: 'super_admin' | 'admin';
  permissions: AdminPermissions;  // §2.3 14-bit 구조 그대로 포함
}
```

#### 서명 알고리즘

| 항목 | 값 | 근거 |
|------|---|------|
| 알고리즘 | **HS256** (HMAC-SHA256) | 단일 서버 발급/검증. 비대칭키 불필요 (MVP) |
| 비밀키 | 환경변수 `ADMIN_JWT_SECRET` | core/config.ts에서 검증 (Q-8). 최소 32바이트 |
| 라이브러리 | `jose` (또는 동급) | Next.js Edge 호환 |

#### 검증 순서 (authenticateAdmin 내부)

```
1. Authorization 헤더에서 Bearer 토큰 추출
   → 없음: 401 AUTH_TOKEN_INVALID
2. JWT 서명 검증 (HS256 + ADMIN_JWT_SECRET)
   → 실패: 401 AUTH_TOKEN_INVALID
3. exp 만료 확인
   → 만료: 401 AUTH_TOKEN_EXPIRED
4. sub로 admin_users 조회 (status = 'active' 확인)
   → 미존재 또는 inactive: 401 ADMIN_AUTH_ACCOUNT_INACTIVE
5. DB의 role/permissions를 사용 (JWT 클레임은 캐시 역할, DB가 정본)
   → AuthenticatedAdmin 반환
```

> **설계 결정**: JWT의 permissions는 빠른 거부(fast reject)용 캐시. 권한 변경 즉시 반영을 위해 `authenticateAdmin`은 매 요청 DB를 조회한다. MVP 관리자 수 상한 ~50명, 동시 요청 ~10건 수준에서 부하 무시 가능 (admin_users 소규모 테이블, PK 조회). v0.2에서 Redis 캐시 도입 시 TTL 기반으로 전환.

#### 시나리오 검증

| 시나리오 | JWT 상태 | DB 상태 | 결과 |
|---------|---------|---------|------|
| 정상 접근 | 유효, permissions 일치 | active | 200 정상 처리 |
| 토큰 없이 접근 | 없음 | - | 401 `AUTH_TOKEN_INVALID` |
| 권한 변경 직후 (JWT 갱신 전) | 구 permissions | DB에 새 permissions | DB 기준 판단 → 새 권한 적용 |
| 계정 비활성화 직후 | 유효 JWT 보유 | inactive | 401 `ADMIN_AUTH_ACCOUNT_INACTIVE` (즉시 차단) |

### 5.2 미들웨어 에러 처리 흐름

#### 에러 발생 지점과 응답 생성

```
요청 → authenticateAdmin() → checkPermission() → handler → 응답
         │                      │                    │
         ├─ throw 401 ──┐      ├─ throw 403 ──┐    ├─ throw 4xx/5xx
         │              │      │              │    │
         ▼              │      ▼              │    ▼
  [에러 catch 계층]     │  [에러 catch 계층]  │  [에러 catch 계층]
                        │                    │
                        ▼                    ▼
                   JSON 응답 생성        JSON 응답 생성 + 감사 로그 기록
```

#### 에러 응답 생성 규칙

| 발생 함수 | HTTP | 에러 코드 | 감사 로그 | 응답 본문 예시 |
|-----------|------|----------|----------|--------------|
| `authenticateAdmin` — 토큰 없음/무효 | 401 | `AUTH_TOKEN_INVALID` | ❌ (actor 불명) | `{ error: { code, message, details: null } }` |
| `authenticateAdmin` — 토큰 만료 | 401 | `AUTH_TOKEN_EXPIRED` | ❌ (actor 불명) | 동일 |
| `authenticateAdmin` — 계정 비활성 | 401 | `ADMIN_AUTH_ACCOUNT_INACTIVE` | ✅ `login_failure` (이메일+IP) | 동일 |
| `checkPermission` — 권한 부족 | 403 | `ADMIN_AUTH_INSUFFICIENT_PERMISSION` | ✅ (actor_id + 요청 resource/action) | `{ error: { code, message, details: { resource, action } } }` |
| `authenticateUser` — Supabase 세션 무효 | 401 | `AUTH_SESSION_NOT_FOUND` | ❌ | 동일 |

> **로그인 에러**: `ADMIN_AUTH_EMAIL_NOT_REGISTERED`는 미들웨어가 아닌 로그인 route handler에서 발생. api-spec.md §6.1 참조.

> **감사 로그 시점**: 에러 throw 직전이 아니라, 에러 응답 생성 직전에 기록한다. 이유: actor 식별이 가능한 경우에만 기록하며, 로그 실패가 에러 응답을 방해하지 않도록 한다.

#### 구현 패턴

```typescript
// server/core/admin-auth.ts

async function authenticateAdmin(req: Request): Promise<AuthenticatedAdmin> {
  const token = extractBearerToken(req);
  if (!token) throw new AuthError('AUTH_TOKEN_INVALID', 401);

  const payload = await verifyJwt<AdminJwtPayload>(token, ADMIN_JWT_SECRET);
  // verifyJwt 내부: 서명 실패 → AUTH_TOKEN_INVALID, 만료 → AUTH_TOKEN_EXPIRED

  const admin = await findActiveAdmin(payload.sub);
  if (!admin) throw new AuthError('ADMIN_AUTH_ACCOUNT_INACTIVE', 401);

  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
  };
}

function checkPermission(
  admin: AuthenticatedAdmin,
  resource: string,
  action: 'read' | 'write'
): void {
  if (admin.role === 'super_admin') return; // 전체 허용
  const key = `${resource}_${action}` as keyof AdminPermissions;
  if (!admin.permissions[key]) {
    // 감사 로그: 응답 계층에서 catch 후 기록 (아래 패턴)
    throw new PermissionError('ADMIN_AUTH_INSUFFICIENT_PERMISSION', 403, {
      resource, action, admin_id: admin.id,
    });
  }
}
```

```typescript
// API Route에서의 에러 처리 (withAdminAuth 래퍼 또는 try-catch)
try {
  const admin = await authenticateAdmin(req);
  checkPermission(admin, 'product', 'write');
  // ... handler
} catch (e) {
  if (e instanceof PermissionError) {
    const client = createServiceClient();
    await auditLogService.record(client, e.details.admin_id, 'permission_denied', {
      resource: e.details.resource,
      action: e.details.action,
      ip: getClientIp(req),
    });
  }
  return errorResponse(e); // Q-7: 에러 불삼킴
}
```

#### 시나리오 검증

| 시나리오 | 흐름 | 감사 로그 |
|---------|------|----------|
| 정상: 유효 JWT + 권한 있음 | authenticate → check → handler → 200 | 없음 (write 시 handler에서 기록) |
| 토큰 누락 | authenticate throw 401 → 응답 | ❌ actor 불명 |
| 비활성 계정 + 유효 JWT | authenticate → DB 조회 → throw 401 | ✅ login_failure (이메일 식별 가능) |
| 유효 JWT + 권한 없음 | authenticate → check throw 403 → 감사 로그 → 응답 | ✅ actor_id + resource + action |

### 5.3 Supabase 세션 만료 복구 흐름

#### 정상 흐름 (SDK 자동 갱신)

```
Supabase SDK onAuthStateChange 이벤트:
  TOKEN_REFRESHED → 새 session_token 자동 적용 → 이후 API 요청에 새 토큰 사용
```

> Supabase SDK는 access_token 만료 전에 자동으로 refresh_token을 사용하여 갱신한다. 클라이언트 코드에서 별도 갱신 로직 불필요 (api-spec B.5 확인).

#### 갱신 실패 시 클라이언트 행동

```
SDK 갱신 실패 (네트워크 에러, refresh_token 만료 등)
  │
  ├─ onAuthStateChange: SIGNED_OUT 이벤트 발생
  │
  ▼
클라이언트 감지
  │
  ├─ 1. 현재 진행 중인 채팅 스트림: 종료 (SSE 연결 끊김)
  ├─ 2. 진행 중인 API 요청: 401 AUTH_SESSION_NOT_FOUND 수신
  ├─ 3. UI 상태 초기화: 프로필/여정 컨텍스트 클리어
  │
  ▼
복구 시도
  │
  ├─ POST /api/auth/anonymous 호출 (새 anonymous 세션 생성)
  │   ├─ 성공: 새 user_id 발급 → Landing 흐름 (신규 사용자 취급)
  │   └─ 실패: "연결 오류" UI 표시 + 수동 재시도 버튼
  │
  └─ ⚠️ 이전 세션의 데이터(프로필, 대화 히스토리)는 접근 불가
     (RLS가 이전 user_id 기준이므로 새 세션에서 조회 불가)
```

#### 데이터 유실 범위

| 데이터 | 상태 | 근거 |
|--------|------|------|
| 저장 완료된 프로필/대화 | DB에 존재하지만 새 세션에서 접근 불가 | RLS `auth.uid() = user_id` |
| 미저장 채팅 (스트리밍 중 끊김) | 유실 | 비동기 저장 완료 전 끊김 |
| localStorage의 구 session_token | 무효 (refresh_token 만료) | SDK가 자동 삭제 |

> **MVP 수용**: anonymous 사용자의 세션 유실은 MVP에서 허용하는 리스크. v0.2 계정 인증(user 역할)에서 데이터 연속성 보장.

#### 시나리오 검증

| 시나리오 | SDK 동작 | 클라이언트 행동 | 결과 |
|---------|---------|---------------|------|
| 정상: 토큰 만료 전 갱신 | TOKEN_REFRESHED | 무중단 | 연속 사용 |
| 네트워크 일시 장애 후 복구 | SDK 재시도 → TOKEN_REFRESHED | 일시 지연 후 정상 | 연속 사용 |
| refresh_token 만료 (90일 미접속) | SIGNED_OUT | 새 anonymous 세션 생성 | 신규 사용자 취급 |

### 5.4 비동기 작업 user_id 전달 패턴

> §1.4의 "비동기 후처리: service_role + user_id 필수 파라미터" 구현 상세.

#### 대상 비동기 작업 (api-spec §3.4 #9~#11)

| 작업 | 트리거 | user_id 필요 이유 |
|------|--------|------------------|
| 대화 히스토리 저장 | 채팅 스트림 완료 후 | messages.conversation_id → conversations.user_id |
| 행동 로그 기록 | 채팅 중 tool 호출 시 | behavior_logs.user_id |
| 개인화 추출 결과 DB 저장 | 채팅 스트림 완료 후 | learned_preferences.user_id (추출 자체는 동기 tool — api-spec §3.4 #7b) |

#### 전달 패턴

```typescript
// 채팅 route handler (app/api/chat/route.ts)
export async function POST(req: Request) {
  const user = await authenticateUser(req);  // ← user_id 확보 시점
  const client = createAuthenticatedClient(user.token);

  // 동기: RLS 적용 클라이언트로 데이터 조회
  const conversation = await chatService.getOrCreateConversation(client, user.id, body);
  const history = await chatService.loadHistory(client, conversation.id);

  // 스트리밍 응답 시작
  const stream = await chatService.streamChat({
    userId: user.id,    // ← 비동기 작업에 전달할 user_id
    conversationId: conversation.id,
    history,
    message: body.message,
  });

  return stream.toUIMessageStreamResponse();
}
```

```typescript
// 비동기 후처리 (chatService 내부 또는 onFinish 콜백)
async function onStreamFinish(params: {
  userId: string;       // route에서 전달받은 user_id (TypeScript 필수 파라미터)
  conversationId: string;
  messages: Message[];
}) {
  const serviceClient = createServiceClient();  // RLS 우회

  // 모든 DB 작업에 userId 명시 전달
  await messageRepository.saveMessages(serviceClient, params.conversationId, params.messages);
  await behaviorLogRepository.recordEvents(serviceClient, params.userId, extractEvents(params.messages));
  await preferenceRepository.updateFromConversation(serviceClient, params.userId, params.messages);
}
```

#### 핵심 제약

| 규칙 | 설명 |
|------|------|
| TypeScript 강제 | `userId: string` (non-optional). 누락 시 컴파일 에러 |
| 클로저 캡처 | route handler에서 확보한 `user.id`를 콜백/비동기 함수에 클로저로 전달 |
| service_role 사용 | 비동기 시점에 사용자 토큰 만료 가능. service_role 클라이언트로 직접 기록 |
| 스택 준수 | route(①) → service(②) → repository(④). P-5 콜 스택 ≤ 4 유지 |

### 5.5 Token 갱신 경쟁 상태 처리

#### 관리자 JWT 갱신 경쟁 상태

**문제**: 관리자 앱에서 여러 탭/요청이 동시에 토큰 갱신(`POST /api/admin/auth/refresh`)을 호출하면, 구 토큰으로 중복 갱신 시도가 발생할 수 있다.

**MVP 처리 (stateless)**:

```
탭 A: refresh(old_jwt) → new_jwt_1 (성공)
탭 B: refresh(old_jwt) → new_jwt_2 (성공 — old_jwt가 아직 유효하므로)
```

| 동작 | 설명 |
|------|------|
| 구 토큰 유효 기간 | 자연 만료까지 유효 (stateless, 블랙리스트 없음) |
| 중복 갱신 결과 | 두 토큰 모두 유효. 보안 리스크 낮음 (관리자 수 제한적) |
| 클라이언트 대응 | 마지막 수신 토큰을 메모리에 저장. 갱신 요청은 단일 Promise로 중복 방지 |

**클라이언트 중복 방지 패턴**:

```typescript
// client/features/admin/auth-token-manager.ts
let refreshPromise: Promise<string> | null = null;

async function getValidToken(): Promise<string> {
  const token = getStoredToken();
  if (!isExpiringSoon(token)) return token;  // 만료 1시간 이전이면 그대로

  // 이미 갱신 중이면 동일 Promise 재사용 (중복 요청 방지)
  if (!refreshPromise) {
    refreshPromise = refreshToken(token).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
```

> **한계**: 클라이언트 메모리 기반 중복 방지는 **탭 간 동기화 불가** (각 탭은 독립 refreshPromise). 탭 A와 탭 B가 동시에 갱신하면 서로 다른 토큰 발급. MVP에서 수용 가능 (관리자 수 제한적, 구/신 토큰 모두 유효).
>
> **v0.2**: Redis 기반 토큰 블랙리스트 도입 시, refresh 응답에 구 토큰 jti를 블랙리스트에 추가하여 단일 토큰만 유효하도록 강제. 탭 간 동기화는 BroadcastChannel API로 해결.

#### Supabase 사용자 토큰 경쟁 상태

Supabase SDK가 내부적으로 처리. SDK의 `_refreshAccessToken`은 내부 lock으로 중복 갱신을 방지한다. 클라이언트에서 별도 처리 불필요.

### 5.6 감사 로그 트랜잭션 정책

#### 원칙

| 규칙 | 설명 |
|------|------|
| 감사 로그는 비즈니스 트랜잭션과 **분리** | 감사 로그 실패가 비즈니스 작업을 롤백하지 않는다 |
| 감사 로그 실패는 **경고 로그** 기록 | 서버 로그(console.error)에 기록. 에러 삼킴 아님 (Q-7 준수) |
| 비즈니스 작업 성공 후 기록 | 실패한 작업은 감사 로그에 기록하지 않는다 (DB 에러 등) |

#### 구현 패턴

```typescript
// 관리자 write route 패턴
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await authenticateAdmin(req);
  checkPermission(admin, 'product', 'write');

  const client = createServiceClient();
  const body = await validateBody(req, productUpdateSchema);

  // 1. 비즈니스 작업 (실패 시 에러 응답 — 감사 로그 없음)
  const before = await productRepository.findById(client, params.id);
  const after = await productRepository.update(client, params.id, body);

  // 2. 감사 로그 (비즈니스 성공 후, 별도 try-catch)
  try {
    await auditLogRepository.insert(client, {
      actor_id: admin.id,
      action: 'update',
      target_type: 'product',
      target_id: params.id,
      changes: { before, after },
      ip_address: getClientIp(req),
    });
  } catch (auditError) {
    // Q-7: 에러 불삼킴 — 경고 로그 기록
    console.error('[AUDIT_LOG_FAILURE]', {
      action: 'update',
      target: `product:${params.id}`,
      admin: admin.id,
      error: auditError,
    });
    // 비즈니스 응답은 정상 반환 (감사 로그 실패가 사용자 경험 차단하지 않음)
  }

  return Response.json({ data: after });
}
```

#### 예외: 권한 거부 감사 로그

`checkPermission` 실패(403) 시의 감사 로그도 동일 정책 적용. 로그 실패가 403 응답을 방해하지 않는다.

#### 시나리오 검증

| 시나리오 | 비즈니스 작업 | 감사 로그 | 최종 응답 |
|---------|-------------|----------|----------|
| 정상 | 성공 | 성공 | 200 + 데이터 |
| 비즈니스 실패 (DB 에러) | 실패 | 기록 안 함 | 500 에러 |
| 비즈니스 성공 + 감사 로그 실패 | 성공 | 실패 → console.error | 200 + 데이터 (정상) |
| 비즈니스 성공 + 감사 로그 DB 타임아웃 | 성공 | 실패 → console.error | 200 + 데이터 (지연 가능) |

> **v0.2 고려**: 감사 로그 실패 빈도가 높아지면 별도 큐(메모리 버퍼 → 배치 INSERT) 도입. MVP에서는 동기 INSERT로 충분.

---

## 6. 미들웨어 통합 실행 순서 (P1-55)

### 6.1 Next.js middleware.ts 실행 흐름도

3개 앱(사용자/관리자/제휴업체)의 요청을 단일 middleware.ts에서 분기 처리한다.

```
요청 진입 (middleware.ts)
  │
  ├─ 1. 경로 분류
  │     │
  │     ├─ /api/admin/*  ──→ [API 미들웨어 없음 — Route Handler에서 처리]
  │     │                     (§3.1 authenticateAdmin + checkPermission)
  │     │
  │     ├─ /api/*        ──→ [API 미들웨어 없음 — Route Handler에서 처리]
  │     │                     (§3.1 authenticateUser, 경로별 필수/선택)
  │     │
  │     ├─ /admin/login  ──→ PASS (공개 경로)
  │     │
  │     ├─ /admin/*      ──→ 2. 관리자 페이지 보호
  │     │                     ├─ admin_token 쿠키 존재? (§3.4)
  │     │                     ├─ 없으면 → redirect /admin/login
  │     │                     └─ 있으면 → PASS (상세 검증은 API Route에서)
  │     │
  │     ├─ /partner/*    ──→ 3. 제휴업체 라우트 (v0.2 예약)
  │     │                     └─ 501 Not Implemented 응답
  │     │
  │     └─ /[locale]/*   ──→ 4. 사용자 앱 i18n 처리
  │                           ├─ next-intl locale 판별
  │                           ├─ locale 리다이렉트 (필요 시)
  │                           └─ PASS
  │
  └─ 실행 순서 보장
        1) 경로 분류 (O(1) — startsWith 비교)
        2) 관리자 쿠키 확인 (토큰 존재만, 검증 없음)
        3) i18n locale 처리 (next-intl)
```

**핵심 원칙**:
- middleware.ts는 **라우팅 분기 + 가벼운 리다이렉트**만 담당
- 인증 검증 (JWT 서명, DB 조회, 권한 확인)은 **API Route Handler**에서 수행 (§3.1~§3.3)
- Edge Runtime 제약: middleware에서 DB 접근 불가

### 6.2 제휴업체 앱 라우트 예약 (v0.2)

| 항목 | 설계 |
|------|------|
| 라우트 그룹 | `(partner)/` — app 디렉토리 내 별도 그룹 |
| URL 패턴 | `/partner/*` |
| 인증 | `partnerAuthMiddleware` (v0.2에서 설계) |
| MVP 동작 | middleware.ts에서 `/partner/*` 접근 시 `501 Not Implemented` 응답 |
| 레이아웃 | 사용자/관리자와 독립된 layout.tsx (v0.2 설계) |

**v0.2 예상 역할**:
- `partner` 역할: 자사 데이터(store/clinic/treatment) 셀프서비스 CRUD
- 인증: 별도 가입 + 이메일 인증 또는 초대 링크
- 권한: 자사 엔티티에 대해서만 read/write

### 6.3 크로스 참조 표

본 섹션은 기존 설계 문서를 통합 참조하는 인덱스이다. 각 항목의 상세는 원본 문서에 정의되어 있다.

| 관심사 | 원본 문서 | 참조 섹션 |
|--------|----------|----------|
| 사용자 앱 라우트 트리 | `sitemap.md` | §1 Route Group + §2 User App URLs |
| 관리자 앱 라우트 트리 | `sitemap.md` | §1 Route Group + §3 Admin App URLs |
| 제휴업체 앱 라우트 | 본 문서 | §6.2 (예약만, v0.2) |
| i18n 미들웨어 | `sitemap.md` | §4 Middleware |
| API 경로 보호 (인증) | 본 문서 | §3.1 미들웨어 레이어 |
| API 엔드포인트 목록 | `api-spec.md` | §2~§6 전체 |
| API 엔드포인트별 권한 | 본 문서 | §2.4 권한 매핑 |
| JWT 검증 상세 | 본 문서 | §5.1 JWT 클레임 + §5.2 에러 처리 |
| RLS 정책 | 본 문서 | §3.5 RLS 역할 정의 |
