# 권한 체계 설계 — P1-13 / P1-14 / P1-15

> 버전: 1.0
> 작성일: 2026-03-21
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
| `/api/admin/audit-logs` | GET | JWT | **super_admin 전용** |
| `/api/admin/sync` | POST/GET | JWT | **super_admin 전용** |

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
