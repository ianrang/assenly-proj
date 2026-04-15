# API 명세 — P1-19 ~ P1-24

> 버전: 1.1
> 작성일: 2026-03-22
> 근거: auth-matrix.md, schema.dbml, sitemap.md, PRD §3~4, TDD §3.7, 7.2-ADMIN, PoC P0-12~13
> 아키텍처: CLAUDE.md P-4 (Composition Root), L-1 (thin route), 옵션 B (서버 API 경유)

---

## 목차

1. [공통 규격 (P1-19)](#1-공통-규격-p1-19)
2. [사용자 앱 API (P1-20)](#2-사용자-앱-api-p1-20)
3. [Chat API 스트리밍 (P1-21)](#3-chat-api-스트리밍-p1-21)
4. [Rate Limiting (P1-22)](#4-rate-limiting-p1-22)
5. [관리자 CRUD API (P1-23)](#5-관리자-crud-api-p1-23)
6. [관리자 인증 API (P1-24)](#6-관리자-인증-api-p1-24)

---

# 1. 공통 규격 (P1-19)

## 1.1 응답 형식

### 성공 응답

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-22T12:00:00Z"
  }
}
```

### 목록 응답 (페이지네이션)

```json
{
  "data": [ ... ],
  "meta": {
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "totalPages": 8,
    "timestamp": "2026-03-22T12:00:00Z"
  }
}
```

### 에러 응답

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product with id 'xxx' not found",
    "details": null
  }
}
```

## 1.2 HTTP 상태 코드

| 코드 | 의미 | 사용 |
|------|------|------|
| 200 | 성공 | GET, PUT, DELETE |
| 201 | 생성됨 | POST (리소스 생성) |
| 400 | 잘못된 요청 | zod 검증 실패, 잘못된 파라미터 |
| 401 | 인증 실패 | 토큰 없음, 만료, 무효 |
| 403 | 권한 없음 | 인증됨이지만 해당 리소스 접근 불가 |
| 404 | 찾을 수 없음 | 리소스 미존재 |
| 409 | 충돌 | 중복 데이터 (이메일 등) |
| 429 | 요청 과다 | Rate limit 초과 |
| 500 | 서버 에러 | 예상치 못한 에러 |

## 1.3 에러 코드 체계

`{DOMAIN}_{ERROR}` 패턴:

| 도메인 | 코드 예시 |
|--------|----------|
| AUTH | `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, `AUTH_SESSION_NOT_FOUND` |
| ADMIN_AUTH | `ADMIN_AUTH_EMAIL_NOT_REGISTERED`, `ADMIN_AUTH_ACCOUNT_INACTIVE`, `ADMIN_AUTH_INSUFFICIENT_PERMISSION` |
| PROFILE | `PROFILE_NOT_FOUND`, `PROFILE_VALIDATION_FAILED` |
| JOURNEY | `JOURNEY_NOT_FOUND`, `JOURNEY_VALIDATION_FAILED` |
| CHAT | `CHAT_LLM_TIMEOUT`, `CHAT_LLM_ERROR`, `CHAT_CONVERSATION_NOT_FOUND` |
| PRODUCT | `PRODUCT_NOT_FOUND`, `PRODUCT_VALIDATION_FAILED` |
| STORE | `STORE_NOT_FOUND` |
| CLINIC | `CLINIC_NOT_FOUND` |
| TREATMENT | `TREATMENT_NOT_FOUND` |
| BRAND | `BRAND_NOT_FOUND` |
| INGREDIENT | `INGREDIENT_NOT_FOUND` |
| RELATION | `RELATION_ALREADY_EXISTS`, `RELATION_ENTITY_NOT_FOUND` |
| RATE_LIMIT | `RATE_LIMIT_EXCEEDED` |
| VALIDATION | `VALIDATION_FAILED` |

## 1.4 페이지네이션

관리자 API 목록 조회: **offset 기반**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `page` | number | 1 | 페이지 번호 |
| `pageSize` | number | 20 | 페이지당 항목 수 (max 100) |
| `sort` | string | `created_at` | 정렬 필드 |
| `order` | string | `desc` | `asc` / `desc` |

사용자 API 검색: **limit/offset 단순 방식**

| 파라미터 | 타입 | 기본값 |
|---------|------|--------|
| `limit` | number | 10 (max 50) |
| `offset` | number | 0 |

## 1.5 공통 요청 헤더

| 헤더 | 값 | 필수 |
|------|---|------|
| `Content-Type` | `application/json` | POST/PUT |
| `Authorization` | `Bearer {token}` | 인증 필요 API |
| `Accept-Language` | `en`, `ko`, ... | 사용자 API (선택) |

## 1.6 공통 응답 헤더

| 헤더 | 값 | 설명 |
|------|---|------|
| `X-RateLimit-Limit` | `15` | 현재 윈도우 최대 요청 수 |
| `X-RateLimit-Remaining` | `3` | 남은 요청 수 |
| `X-RateLimit-Reset` | `1679012345` | 윈도우 리셋 Unix timestamp |
| `Retry-After` | `30` | 429 시 대기 초 |

## 1.7 Route 코드 패턴 (CLAUDE.md L-1)

```typescript
// 모든 API route는 이 패턴을 따른다 (thin route)
export async function METHOD(req: Request) {
  // 1. 인증 (core/auth 또는 core/admin-auth)
  // 2. 입력 검증 (zod schema — shared/types)
  // 3. DB 클라이언트 생성 (core/db)
  // 4. service 호출 (features/ — client 파라미터 전달)
  // 5. 응답 반환
}

// 관리자 write route는 미들웨어 체인:
// withAdminAuth(resource, action) → withAuditLog(event) → handler
```

---

# 2. 사용자 앱 API (P1-20)

> 인증: Supabase anonymous session. DB: createAuthenticatedClient (RLS 적용).

## 2.1 인증

### `POST /api/auth/anonymous`

세션 생성 + 동의 기록. 인증 불필요.

**요청:**
```json
{
  "consent": {
    "data_retention": true
  }
}
```

> Landing CTA 클릭 시 인라인 동의에서 수집한 data_retention 동의를 세션 생성과 동시에 기록 (PRD §3.2).
> marketing 동의는 Kit CTA 시점에 별도 수집 (`POST /api/kit/claim`).

**응답 201:**
```json
{
  "data": {
    "user_id": "uuid",
    "session_token": "supabase_access_token"
  }
}
```

**구현**: Supabase `signInAnonymously()` → users + consent_records INSERT (service_role) → 토큰 반환.

> **세션 복구 (재방문)**: 클라이언트는 session_token을 localStorage에 보관. 재방문 시 Supabase SDK가 세션을 자동 복구하고, `GET /api/profile`을 호출하여 기존 프로필 존재 여부를 확인한다 (200=재방문, 404=신규/미완료). 별도 세션 검증 API 불필요.

## 2.2 도메인 데이터 (공개 읽기)

### `GET /api/products`

**인증**: 선택 (비로그인 허용)

**쿼리 파라미터:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `skin_types` | string (comma) | `dry,oily` → 배열 필터 |
| `concerns` | string (comma) | `acne,pores` → 배열 겹침 필터 (하나라도 매치) |
| `category` | string | `skincare`, `makeup` 등 |
| `budget_max` | number | 최대 가격 (KRW) |
| `search` | string | 텍스트 검색 (name ko/en ILIKE) |
| `limit` | number | 기본 10, 최대 50 |
| `offset` | number | 기본 0 |

**응답 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": { "en": "...", "ko": "..." },
      "brand_id": "uuid | null",
      "category": "skincare",
      "skin_types": ["dry", "combination"],
      "concerns": ["dryness", "dullness"],
      "price": 18000,
      "rating": 4.7,
      "review_count": 2340,
      "is_highlighted": false,
      "images": ["url1", "url2"]
    }
  ],
  "meta": { "total": 150 }
}
```

> `embedding` 필드는 반환하지 않음 (서버 전용).
> 목록 meta에 limit/offset 에코백: `"meta": { "total": 150, "limit": 10, "offset": 0 }`.

### `GET /api/products/:id`

단일 제품 상세. 전체 필드 반환 (embedding 제외). brand 정보 포함 (JOIN).

**응답 200:**
```json
{
  "data": {
    "id": "uuid",
    "name": { "en": "...", "ko": "..." },
    "brand": { "id": "uuid", "name": { "en": "COSRX", "ko": "코스알엑스" } },
    "category": "skincare",
    "skin_types": ["dry", "combination"],
    "concerns": ["dryness", "dullness"],
    "key_ingredients": ["Snail Secretion Filtrate"],
    "price": 18000,
    "volume": "96ml",
    "purchase_links": [{ "platform": "olive_young", "url": "..." }],
    "english_label": true,
    "tourist_popular": true,
    "is_highlighted": false,
    "highlight_badge": null,
    "rating": 4.7,
    "review_count": 2340,
    "review_summary": { "en": "..." },
    "images": ["url1", "url2"],
    "tags": ["essence", "hydrating"],
    "status": "active"
  }
}
```

> brand/ingredient는 제품 상세 응답에 포함하여 반환. 별도 `GET /api/brands/:id`, `GET /api/ingredients/:id` 엔드포인트는 v0.2에서 필요 시 추가.

### `GET /api/treatments`

**쿼리 파라미터:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `skin_types` | string (comma) | 적합 피부타입 필터 |
| `concerns` | string (comma) | 대상 고민 필터 (overlap — 하나라도 겹침) |
| `category` | string | `skin`, `laser`, `injection`, `facial`, `body`, `hair` |
| `budget_max` | number | `price_max <= budget_max` |
| `max_downtime` | number | `downtime_days <= max_downtime` |
| `search` | string | 텍스트 검색 (name ko/en) |
| `limit`, `offset` | number | 페이지네이션 |

### `GET /api/treatments/:id`

단일 시술 상세. `price_min`, `price_max`, `price_currency` 포함. clinic 정보는 `clinic_treatments` JOIN으로 제공.

### `GET /api/stores`

**인증**: 선택. **필터**: `district`, `english_support`, `store_type`, `query`, `limit`, `offset`.

### `GET /api/stores/:id`

단일 매장 상세.

### `GET /api/clinics`

**인증**: 선택. **필터**: `district`, `english_support`, `clinic_type`, `query`, `limit`, `offset`.

### `GET /api/clinics/:id`

단일 클리닉 상세. `foreigner_friendly`, `external_links` 포함.

## 2.3 프로필

### `POST /api/profile/onboarding`

**인증**: 필수

**NEW-9b**: 두 경로를 discriminated union으로 수용 (`skipped` 필드로 구분).

**요청 (Start 경로 — full wizard, v0.2 경로A):**
```json
{
  "skin_type": "combination",
  "hair_type": "straight",
  "hair_concerns": ["damage"],
  "country": "US",
  "language": "en",
  "age_range": "25-29",
  "skin_concerns": ["acne", "pores", "dullness"],
  "interest_activities": ["shopping", "clinic"],
  "stay_days": 5,
  "start_date": "2026-04-01",
  "budget_level": "moderate",
  "travel_style": ["efficient", "instagram"]
}
```

**요청 (Start 경로 — OnboardingChips, MVP):**
```json
{
  "skin_type": "dry",
  "skin_concerns": ["acne", "wrinkles"]
}
```
칩에서 수집하지 않는 필드는 모두 optional. `skin_concerns` 최대 3개(PRD §595).

**요청 (Skip 경로):**
```json
{ "skipped": true }
```

**구현 — 3단계 invariant (순서 불변, NEW-9b)**:
1. `upsertProfile` — user_profiles (UP 변수)
2. `createOrUpdateJourney` — journeys (JC 변수). **Skip 경로에서는 실행하지 않음**
3. `markOnboardingCompleted` — user_profiles.onboarding_completed_at 원샷 set (`WHERE IS NULL`)

부분 실패 시 게이트가 NULL로 유지되어 클라이언트가 칩을 재표시하고 재전송 → 멱등 자기 치유(I7).
경합 방어: journeys에 부분 유니크 인덱스 `ux_journeys_user_active` 존재, `createOrUpdateJourney`가 23505 unique_violation 시 1회 재시도.

**응답 201:**
```json
{
  "data": {
    "profile_id": "uuid",
    "journey_id": "uuid | null",
    "onboarding_completed": true
  },
  "meta": { "timestamp": "ISO 8601" }
}
```
`journey_id`는 Skip 경로에서 `null`.

### `GET /api/profile`

**인증**: 필수. 본인 프로필 + 활성 여정 반환.

### `PUT /api/profile`

**인증**: 필수. 부분 업데이트 (변경 필드만 전송).

## 2.4 여정

### `POST /api/journey`

**인증**: 필수. 새 여정 생성 (JC 변수).

### `GET /api/journey/active`

**인증**: 필수. 현재 활성 여정 반환.

## 2.5 Kit CTA

### `POST /api/kit/claim`

**인증**: 필수.

**요청:**
```json
{
  "email": "user@example.com",
  "marketing_consent": true
}
```

**구현**: consent_records.marketing 업데이트 + 이메일 저장 (별도 처리).

## 2.6 대화 히스토리

### `GET /api/chat/history`

**인증**: 필수.

**쿼리**: `conversation_id` (선택. 없으면 최신 대화)

**응답**: messages 배열 (role, content, card_data, created_at).

## 2.7 행동 로그

### `POST /api/events`

**인증**: 필수. **Rate limit**: `RATE_LIMIT_PUBLIC_PER_MIN` 공유.

**요청:**
```json
{
  "events": [
    {
      "event_type": "card_click",
      "target_id": "uuid",
      "target_type": "product",
      "metadata": { "domain": "shopping", "position": 1 }
    }
  ]
}
```

**이벤트 타입**: `path_a_entry`, `card_exposure`, `card_click`, `external_link_click` (ANALYTICS.md §3.2)
**검증**: 이벤트별 zod 스키마 (features/analytics/schema.ts). `kit_cta_submit`은 서버에서 직접 기록 (`POST /api/kit/claim` handler).
**응답**: `{ "data": { "recorded": 3 } }` (기록 건수)
**비동기 처리**: DB INSERT 실패 시 응답에 영향 없음 (fire-and-forget). 에러는 서버 로그만.

---

# 3. Chat API 스트리밍 (P1-21)

## 3.1 엔드포인트

### `POST /api/chat`

**인증**: 필수.

**요청:**
```json
{
  "message": "I have oily skin, recommend a serum",
  "conversation_id": "uuid | null"
}
```

`conversation_id` null이면 새 대화 자동 생성. 새 대화 생성 시 URL `[locale]` 파라미터를 `conversations.locale`에 저장 (K6 KPI 측정용, ANALYTICS.md §2 참조). locale은 `Accept-Language` 헤더 또는 referer URL에서 추출.

> **P2-50b**: 요청 형식이 `{ message: UIMessage, conversation_id }` 로 변경됨 (AI SDK `prepareSendMessagesRequest` 패턴). `conversation_id`는 SSE 응답의 `messageMetadata`(`part.type === 'start'`)로 클라이언트에 전달. 클라이언트는 `onFinish`에서 `message.metadata.conversationId`를 추출하여 이후 요청에 포함.

## 3.2 SSE 이벤트 타입

Vercel AI SDK 6.x `toUIMessageStreamResponse()` 기반.

| 이벤트 | 데이터 | 설명 |
|--------|--------|------|
| `text-delta` | `{ text: "..." }` | 텍스트 청크 (스트리밍) |
| `tool-call` | `{ toolName, input }` | tool 호출 시작 |
| `tool-result` | `{ toolCallId, output }` | tool 결과 (카드 데이터 포함) |
| `step-finish` | `{ finishReason }` | 스텝 완료 |
| `finish` | `{ usage }` | 전체 완료 |
| `error` | `{ code, message }` | 에러 발생 |

## 3.3 에러 이벤트

| 코드 | 의미 | 클라이언트 처리 |
|------|------|---------------|
| `CHAT_LLM_TIMEOUT` | LLM 응답 시간 초과 | "응답 지연" UI + 재시도 버튼 |
| `CHAT_LLM_ERROR` | LLM API 에러 (500 등) | "일시적 오류" UI + 재시도 버튼 |
| `CHAT_RATE_LIMITED` | Chat rate limit 초과 | "잠시 후 다시 시도" UI + Retry-After |

> 에러 복구 상세: llm-resilience.md §2 참조 — 서버 재시도 없음, Claude→Gemini 폴백 1회, 클라이언트 재시도 버튼.

## 3.4 서버 플로우 (TDD §3.7)

```
1. authenticateUser(req)
2. createAuthenticatedClient(token)
3. conversation 조회 또는 생성
4. 히스토리 로드 (messages, RLS: 본인만)
5. 프로필 로드 (user_profiles + journeys, RLS: 본인만)
6. 시스템 프롬프트 구성
7. LLM 호출 (streamText + tool_use, stopWhen: stepCountIs)
   7a. tool_use: search_beauty_data (검색)
   7b. tool_use: extract_user_profile (개인화 추출 — P1-33 확정: 동기 tool)
8. SSE 스트리밍 응답
9. (비동기) 대화 히스토리 저장
10. (비동기) 행동 로그 기록 — service_role + user_id 명시
11. (비동기) 개인화 추출 결과 — 조건부 저장 (PRD §4-C 동의 원칙)
    - **프로필 존재**: 추출 결과를 비동기로 DB 갱신 (`updateProfile` — skin_type, age_range).
    - **프로필 미존재** (MVP Chat-First: 온보딩 스킵): `createMinimalProfile` → `updateProfile` 순차 호출. 최소 프로필 생성 후 추출 필드 저장. PK 충돌(동시 요청) 시 graceful 처리 후 updateProfile 진행.
```

---

# 4. Rate Limiting (P1-22)

## 4.1 제한값

| 엔드포인트 | 제한 | 윈도우 | 식별 |
|-----------|------|--------|------|
| `POST /api/chat` | **15회** | 분당 | user_id |
| `POST /api/chat` (일일) | **100회** | 일일 | user_id |
| `POST /api/auth/anonymous` | **3회** | 분당 | IP |
| `GET /api/*` (사용자 읽기) | **60회** | 분당 | IP 또는 user_id |
| `/api/admin/*` (전체) | **60회** | 분당 | admin_id |

> 모든 값은 환경변수로 조정 가능 (core/config.ts). v0.2에서 관리자 UI 관리 (V2-1).

## 4.2 구현

**MVP**: 메모리 Map (서버 프로세스 내).

```typescript
// server/core/rate-limit.ts
// Map<key, { count, windowStart }>
// key = `${identifier}:${endpoint}:${window}`
```

**v0.2**: Upstash Redis (다중 인스턴스 지원, V2-3).

## 4.3 응답

**정상 요청**: `X-RateLimit-*` 헤더 포함 (§1.6).

**429 응답:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again in 30 seconds.",
    "details": { "retryAfter": 30 }
  }
}
```

헤더: `Retry-After: 30`

## 4.4 구현 위치

`server/core/rate-limit.ts` — 비즈니스 무관 (L-5 준수). Route 미들웨어로 적용.

---

# 5. 관리자 CRUD API (P1-23)

> 인증: 자체 JWT. DB: createServiceClient (RLS 우회). 감사 로그: withAuditLog 미들웨어.

## 5.1 제네릭 CRUD 패턴

6 엔티티(Product, Store, Brand, Ingredient, Clinic, Treatment)에 동일 패턴 적용.

### 목록 조회: `GET /api/admin/{entity}`

**권한**: `{entity}_read`

**쿼리 파라미터**: §1.4 페이지네이션 + 엔티티별 필터

| 공통 필터 | 타입 | 설명 |
|----------|------|------|
| `status` | string | `active`, `inactive`, `temporarily_closed`, `all` |
| `search` | string | name 텍스트 검색 (ko/en) |
| `page`, `pageSize`, `sort`, `order` | - | §1.4 |

**응답 200**: §1.1 목록 응답 형식.

### 상세 조회: `GET /api/admin/{entity}/:id`

**권한**: `{entity}_read`

**응답 200**: 전체 필드 + 관계 데이터 포함.

```json
{
  "data": {
    "id": "uuid",
    "name": { "ko": "...", "en": "..." },
    "...": "...",
    "relations": {
      "stores": [ { "id": "uuid", "name": {...} } ],
      "ingredients": [ { "id": "uuid", "name": {...}, "type": "key" } ]
    }
  }
}
```

> `relations`는 Product에 stores/ingredients, Clinic에 treatments.

### 생성: `POST /api/admin/{entity}`

**권한**: `{entity}_write`
**감사 로그**: `{entity}.create`

**요청**: 엔티티 필드 (§7.2-ADMIN §7.2.6 필수/선택 규칙 적용)

**검증**: zod 스키마. 필수 필드, 다국어(ko+en), enum 허용값, 숫자 범위.

**응답 201**: 생성된 엔티티 전체.

### 수정: `PUT /api/admin/{entity}/:id`

**권한**: `{entity}_write`
**감사 로그**: `{entity}.update` (before/after 기록)

**요청**: 부분 업데이트 (변경 필드만).

**응답 200**: 수정된 엔티티 전체.

> **비동기 side-effect**: 임베딩 텍스트 필드(name, description, category 등)가 변경되면 embedding 벡터가 백그라운드에서 재생성된다. 응답을 차단하지 않는다. 상세: embedding-strategy.md §3.4.

### 비활성화: `DELETE /api/admin/{entity}/:id`

**권한**: `{entity}_write`
**감사 로그**: `{entity}.deactivate`

**구현**: `UPDATE SET status = 'inactive'`. 영구 삭제 아님 (§7.2.2).

**비즈니스 규칙**:
- 비활성화 시 `is_highlighted` 자동 해제 (DV-C9)
- 관련 데이터 수/영향 범위를 응답에 포함 (DV-D1)

**응답 200:**
```json
{
  "data": {
    "id": "uuid",
    "status": "inactive",
    "affected": {
      "relations": 3,
      "highlight_removed": true
    }
  }
}
```

## 5.2 관계 관리 API

### `POST /api/admin/relations/{relationType}`

**관계 타입**: `product-store`, `product-ingredient`, `clinic-treatment`

**권한**: 양쪽 엔티티 중 하나에 write 권한 (§7.2.1)

**요청:**
```json
{
  "source_id": "uuid",
  "target_id": "uuid",
  "type": "key"
}
```

> `type`은 product-ingredient만 해당 (key/avoid).

**감사 로그**: `relation.connect`

### `DELETE /api/admin/relations/{relationType}`

**요청**: `{ "source_id": "uuid", "target_id": "uuid" }`

**감사 로그**: `relation.disconnect`

## 5.3 하이라이트 관리

> 대상 엔티티: **Product, Store, Clinic, Treatment** (4개만). Brand, Ingredient는 `is_highlighted` 컬럼 없음 (schema.dbml 참조).

### `PUT /api/admin/{entity}/:id/highlight`

**권한**: `{entity}_write` (entity = products, stores, clinics, treatments만)

**요청:**
```json
{
  "is_highlighted": true,
  "highlight_badge": { "ko": "에센리 픽", "en": "Essenly Pick" }
}
```

**검증**: `is_highlighted=true`이면 `highlight_badge.en` 필수 (DV-C7). inactive 엔티티 불가 (DV-C8).

**감사 로그**: `{entity}.highlight_on` 또는 `{entity}.highlight_off`

## 5.4 이미지 업로드

### `POST /api/admin/{entity}/:id/images`

**권한**: `{entity}_write`

**요청**: `multipart/form-data` (파일 + 메타데이터)

**검증** (§7.2.5):
- 형식: JPEG, PNG, WebP만 (파일 내용 기반)
- 크기: 단일 5MB 이하
- 수량: 최대 10장, 최소 1장 유지

**응답 201:**
```json
{
  "data": {
    "images": ["cdn_url_1", "cdn_url_2"]
  }
}
```

### `DELETE /api/admin/{entity}/:id/images/:imageIndex`

최소 1장 유지 검증.

### `PUT /api/admin/{entity}/:id/images/order`

순서 변경. `{ "order": [2, 0, 1, 3] }` (인덱스 배열).

## 5.5 엔티티별 추가 필터

| 엔티티 | 추가 필터 |
|--------|----------|
| Product | `category`, `brand_id`, `has_highlight` |
| Store | `district`, `store_type` |
| Clinic | `district`, `clinic_type` |
| Treatment | `category` |
| Brand | `tier`, `is_essenly` |

---

# 6. 관리자 인증 API (P1-24)

## 6.1 Google SSO 로그인

### `POST /api/admin/auth/login`

**요청:**
```json
{
  "google_token": "google_oauth_id_token"
}
```

**서버 플로우:**
1. Google OAuth ID 토큰 검증 (Google API)
2. 이메일 추출
3. `admin_users` 테이블에서 이메일 조회
4. 미등록 → 401 `ADMIN_AUTH_EMAIL_NOT_REGISTERED`
5. 비활성 → 401 `ADMIN_AUTH_ACCOUNT_INACTIVE`
6. 자체 JWT 발급 (24h 만료, admin_id + role + permissions 포함)
7. 감사 로그: `login_success`
8. 응답

**응답 200:**
```json
{
  "data": {
    "token": "eyJhbG...",
    "admin": {
      "id": "uuid",
      "email": "admin@essenly.com",
      "name": "Admin Name",
      "role": "super_admin",
      "permissions": { "product_read": true, "product_write": true, "..." : "..." }
    },
    "expiresAt": "2026-03-23T12:00:00Z"
  }
}
```

**실패 시**: 감사 로그 `login_failure` (이메일 + IP 기록).

## 6.2 현재 세션

### `GET /api/admin/auth/me`

**인증**: JWT

**응답 200**: admin 정보 (§6.1 응답의 `admin` 부분과 동일).

## 6.3 토큰 갱신

### `POST /api/admin/auth/refresh`

**인증**: 현재 JWT (만료 1시간 이내)

**응답 200**: 새 JWT.

> 만료 1시간 이전부터 갱신 가능. 완전 만료 시 재로그인.

## 6.4 로그아웃

### `POST /api/admin/auth/logout`

**인증**: JWT

**구현**: 클라이언트에서 토큰 삭제. 서버는 stateless (JWT 블랙리스트 미사용 — MVP).

**감사 로그**: `logout`

## 6.5 Admin 계정 관리 (super_admin 전용)

### `GET /api/admin/users`

전체 admin 목록. 필터: status.

### `POST /api/admin/users`

**요청:**
```json
{
  "email": "newadmin@essenly.com",
  "name": "New Admin",
  "role": "admin",
  "permissions": {
    "product_read": true,
    "product_write": false,
    "store_read": true,
    "store_write": true
  }
}
```

**감사 로그**: `admin.create`

### `PUT /api/admin/users/:id`

역할/권한 변경. 감사 로그: `permission_change` (before/after).

### `PUT /api/admin/users/:id/deactivate`

비활성화. 감사 로그: `admin.deactivate`.

> 최소 1명 활성 super_admin 보장 (§7.2.3).

### `PUT /api/admin/users/:id/reactivate`

재활성화. 감사 로그: `admin.reactivate`.

## 6.6 감사 로그 조회 (super_admin 전용)

### `GET /api/admin/audit-logs`

**필터:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `actor_id` | uuid | 특정 관리자 |
| `action` | string | 이벤트 유형 |
| `target_type` | string | 엔티티 종류 |
| `target_id` | uuid | 특정 엔티티 |
| `from` | ISO datetime | 시작 날짜 |
| `to` | ISO datetime | 종료 날짜 |
| `page`, `pageSize` | number | §1.4 |

**응답**: 시간순(최신 순) + §1.1 목록 형식.

---

# 부록: 구현 아키텍처 매핑

> API 레이어: Hono + @hono/zod-openapi (CLAUDE.md L-20~L-23).
> 자동 문서화: `GET /api/docs` (Swagger UI), `GET /api/docs/openapi.json`.
> Route 파일 위치: CLAUDE.md L-20 참조. 이 문서에 파일 경로를 중복 기재하지 않는다 (D-7 단방향 참조).

| API 그룹 | Service | Repository |
|---------|---------|------------|
| auth | features/auth/service.ts | - |
| profile | features/profile/service.ts + features/journey/service.ts | - |
| chat | features/chat/service.ts | repositories/* |
| kit | - (직접 DB + core/crypto) | - |
| events | - (직접 DB) | - |
| products | - | repositories/product-repository.ts |
| treatments | - | repositories/treatment-repository.ts |
| stores | - | repositories/store-repository.ts |
| clinics | - | repositories/clinic-repository.ts |
| admin CRUD (P2-81) | features/admin/service.ts | repositories/* |

---

# 부록: 설계 보완 사항

## B.1 DB 클라이언트 3종 (auth-matrix.md §1.4)

| 클라이언트 | 용도 | RLS |
|-----------|------|-----|
| `createAuthenticatedClient(token)` | 사용자 API (동기) | ✅ 적용 |
| `createServiceClient()` | 관리자 API + 비동기 후처리 | ❌ 우회 |
| `createAnonClient()` | 비인증 사용자 공개 데이터 읽기 | ✅ 적용 (`USING(true)`) |

## B.2 재방문 감지 패턴

```
1. 클라이언트: localStorage에서 session_token 복구
2. Supabase SDK: 세션 자동 복구 (token refresh 포함)
3. GET /api/profile 호출:
   - 200 + data  → 재방문 (프로필 존재) → PRD §3.2 "Welcome back" 흐름
   - 404          → 신규 또는 onboarding 미완료 → Landing 흐름
   - 401          → 세션 만료/무효 → POST /api/auth/anonymous 재호출
```

## B.3 필터 동작 정의

| 필터 | 동작 | SQL 패턴 |
|------|------|---------|
| `skin_types=dry,oily` | 배열 겹침 (OR) | `skin_types && ARRAY['dry','oily']` |
| `concerns=acne,pores` | 배열 겹침 (OR) | `concerns && ARRAY['acne','pores']` (하나라도 겹침) |
| `category=skincare` | 정확 일치 | `category = 'skincare'` |
| `budget_max=20000` | 이하 | `price <= 20000` (products) 또는 `price_max <= 20000` (treatments) |
| `district=gangnam` | 정확 일치 | `district = 'gangnam'` |
| `english_support=fluent` | 정확 일치 | `english_support = 'fluent'` |
| `search=cosrx` | 부분 일치 (ko/en) | `name->>'ko' ILIKE '%cosrx%' OR name->>'en' ILIKE '%cosrx%'` |
| `status=all` (관리자) | 필터 미적용 | WHERE 절 생략 |
| `has_highlight=true` (관리자) | boolean | `is_highlighted = true` |

> `skin_types` (복수, 필터): 제품이 적합한 피부타입 배열에서 겹침 검색.
> `skin_type` (단수, 프로필): 사용자의 단일 피부타입. 혼동 방지 목적으로 구분.

## B.4 onboarding vs journey 역할 구분

| 엔드포인트 | 용도 | MVP 사용 |
|-----------|------|---------|
| `POST /api/profile/onboarding` | 최초 설정: user_profiles + 첫 journey 동시 생성 | ✅ |
| `POST /api/journey` | 후속 여정 생성 (기존 프로필 유지, 새 JC 변수) | v0.2 (다중 여정) |

> `end_date`: 서버에서 `start_date + stay_days`로 자동 계산. 클라이언트 전송 불필요.

## B.5 보안 보완 사항

**JWT 저장 전략**:
- 관리자 API 인증: `Authorization: Bearer {jwt}` 헤더만 사용
- 페이지 가드 (Next.js middleware): `admin_token` httpOnly 쿠키로 로그인 여부 확인 (리다이렉트 용도만, API 인증 아님)
- CSRF: API는 Authorization 헤더 기반이므로 CSRF 위험 없음 (쿠키 인증 미사용)

**JWT 무효화 (MVP 제한)**:
- Stateless 설계: 로그아웃 시 클라이언트 토큰 삭제만. 서버 블랙리스트 없음
- 리스크: 탈취된 JWT는 만료(24h)까지 유효
- v0.2: 메모리 블랙리스트 도입 예정 (V2-1)

**토큰 갱신**: 갱신 후 구 토큰은 자연 만료까지 유효 (stateless). 보안 이벤트 시 super_admin이 해당 admin 비활성화로 대응.

**Supabase anonymous 세션 갱신**: Supabase SDK가 자동 처리 (`onAuthStateChange`). 서버 API에서 별도 갱신 엔드포인트 불필요.

**세션 비활동 타임아웃 (30분)**: 클라이언트 타이머로 구현 (PRD §3.9). API 호출/사용자 인터랙션으로 타이머 리셋. 30분 경과 시 세션 만료 오버레이 표시 → Landing 이동 (user-screens.md §2.1). 서버 세션(Supabase JWT)은 별도 만료 주기 (기본 1시간). 프로필 데이터는 서버에 유지.

## B.6 범위 외 (v0.2)

| 엔드포인트 | 이유 |
|-----------|------|
| `GET /api/brands/:id`, `GET /api/ingredients/:id` | 제품 상세에 brand 포함. 별도 불필요 |
| `GET /api/conversations` | MVP 단일 대화. chat/history로 충분 |
| `POST /api/admin/sync` | V2-2 데이터 동기화 기능 |
| 토큰 블랙리스트 API | V2-1 관리자 설정 기능 |
