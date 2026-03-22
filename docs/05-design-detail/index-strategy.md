# 인덱스 전략 — P1-18

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: schema.dbml v2.0, search-engine.md v1.1, api-spec.md v1.1, auth-matrix.md v1.1
> 원칙: 쿼리 패턴 기반 최소 인덱스. Over-indexing 방지.

---

## 1. 설계 원칙

### 1.1 인덱스 생성 기준

| 생성한다 | 생성하지 않는다 |
|---------|---------------|
| WHERE 절에 빈번히 사용되는 컬럼 | 카디널리티 낮은 boolean (전체 대비 선택도 50%) |
| JOIN/FK 조건 컬럼 (비 PK 쪽) | PK/UNIQUE 제약이 이미 암묵적 인덱스를 제공하는 컬럼 |
| ORDER BY + LIMIT 패턴에서 정렬 기준 컬럼 | MVP 데이터 < 1,000건인 테이블의 단독 정렬 컬럼 |
| RLS `auth.uid() = user_id` 패턴의 user_id | JSONB 내부 키 (MVP 데이터 규모에서 sequential scan 충분) |
| 배열 겹침(`&&`)/포함(`@>`) 연산 대상 (GIN) | 벡터 컬럼 (MVP: sequential scan, v0.2+: IVFFlat/HNSW) |
| 관리자 감사 로그 필터 (시간 범위 + actor) | display-only JSONB (card_data, tool_calls, metadata) |

### 1.2 네이밍 규칙

```
idx_{table}_{column}              -- 단일 컬럼 B-tree
idx_{table}_{col1}_{col2}         -- 복합 B-tree
idx_{table}_{column}_gin          -- GIN (배열)
idx_{table}_{column}_gist         -- GiST (지리)
```

### 1.3 MVP 벡터 인덱스 제외 근거

schema.dbml 명시: `embedding vector(1024)` — "MVP no index (v0.2+)". MVP 데이터 규모(수백 건)에서 sequential scan의 지연은 수 ms 수준이며, IVFFlat/HNSW 인덱스는 데이터 1,000건 이상에서 효과적이다. v0.2에서 데이터 증가 시 `CREATE INDEX ... USING hnsw` 추가.

---

## 2. 기존 인덱스 현황

### 2.1 001_initial_schema.sql (19개)

```sql
-- 사용자 데이터
CREATE INDEX idx_journeys_user_id ON journeys(user_id);
CREATE INDEX idx_journeys_status ON journeys(status);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_journey_id ON conversations(journey_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_behavior_logs_user_id ON behavior_logs(user_id);
CREATE INDEX idx_learned_preferences_user_id ON learned_preferences(user_id);

-- 도메인 데이터 — 쇼핑
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_skin_types ON products USING GIN(skin_types);
CREATE INDEX idx_products_concerns ON products USING GIN(concerns);
CREATE INDEX idx_stores_district ON stores(district);
CREATE INDEX idx_stores_status ON stores(status);

-- 도메인 데이터 — 시술
CREATE INDEX idx_clinics_district ON clinics(district);
CREATE INDEX idx_clinics_status ON clinics(status);
CREATE INDEX idx_treatments_category ON treatments(category);
CREATE INDEX idx_treatments_target_concerns ON treatments USING GIN(target_concerns);
CREATE INDEX idx_treatments_suitable_skin_types ON treatments USING GIN(suitable_skin_types);
```

### 2.2 004_schema_v2.sql (4개)

```sql
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
```

### 2.3 암묵적 인덱스 (PK/UNIQUE)

| 테이블 | 제약 | 자동 인덱스 |
|--------|------|-----------|
| users | PK(id), UNIQUE(email) | 2개 |
| user_profiles | PK(user_id) | 1개 |
| journeys | PK(id) | 1개 |
| beauty_history | PK(id) | 1개 |
| learned_preferences | PK(id) | 1개 |
| conversations | PK(id) | 1개 |
| messages | PK(id) | 1개 |
| behavior_logs | PK(id) | 1개 |
| consent_records | PK(user_id) | 1개 |
| brands | PK(id) | 1개 |
| ingredients | PK(id) | 1개 |
| products | PK(id) | 1개 |
| stores | PK(id) | 1개 |
| clinics | PK(id) | 1개 |
| treatments | PK(id) | 1개 |
| doctors | PK(id) | 1개 |
| product_stores | PK(product_id, store_id) | 1개 (복합) |
| product_ingredients | PK(product_id, ingredient_id) | 1개 (복합) |
| clinic_treatments | PK(clinic_id, treatment_id) | 1개 (복합) |
| admin_users | PK(id), UNIQUE(email) | 2개 |
| audit_logs | PK(id) | 1개 |

**합계: 명시적 23개 + 암묵적 23개 = 46개**

---

## 3. 쿼리 패턴 분석

### 3.1 경로 1: AI 대화 검색 (search-engine.md §2.3)

LLM tool(`search_beauty_data`)이 `repository.findByFilters()`를 호출한다. `WHERE status = 'active'`가 항상 포함되며, 아래 필터가 null-safe로 추가된다.

| 엔티티 | WHERE 컬럼 | SQL 연산자 | 기존 인덱스 |
|--------|-----------|-----------|-----------|
| products | status | `= 'active'` | idx_products_status ✅ |
| products | skin_types | `&& ARRAY[...]` | idx_products_skin_types (GIN) ✅ |
| products | concerns | `&& ARRAY[...]` | idx_products_concerns (GIN) ✅ |
| products | category | `= ?` | idx_products_category ✅ |
| products | price | `<= ?` | **없음** ⚠️ |
| treatments | status | `= 'active'` | idx_treatments_status **없음** ⚠️ |
| treatments | suitable_skin_types | `&& ARRAY[...]` | idx_treatments_suitable_skin_types (GIN) ✅ |
| treatments | target_concerns | `&& ARRAY[...]` | idx_treatments_target_concerns (GIN) ✅ |
| treatments | category | `= ?` | idx_treatments_category ✅ |
| treatments | price_max | `<= ?` | **없음** ⚠️ |
| treatments | downtime_days | `<= ?` | **없음** ⚠️ |
| stores | status | `= 'active'` | idx_stores_status ✅ |
| stores | district | `= ?` | idx_stores_district ✅ |
| stores | english_support | `= ?` | **없음** ⚠️ |
| stores | store_type | `= ?` | **없음** ⚠️ |
| clinics | status | `= 'active'` | idx_clinics_status ✅ |
| clinics | district | `= ?` | idx_clinics_district ✅ |
| clinics | english_support | `= ?` | **없음** ⚠️ |
| clinics | clinic_type | `= ?` | **없음** ⚠️ |

### 3.2 경로 2: 카드 상세 (search-engine.md §2.1)

`repository.findById()`는 PK 조회이므로 추가 인덱스 불필요.

관계 데이터 JOIN:
| JOIN | 조건 | 기존 인덱스 |
|------|------|-----------|
| products → brands | brands.id (PK) | ✅ |
| products → product_stores → stores | product_stores.product_id (PK 선두) | ✅ |
| products → product_ingredients → ingredients | product_ingredients.product_id (PK 선두) | ✅ |
| treatments → clinic_treatments → clinics | clinic_treatments.treatment_id | **역방향 없음** ⚠️ |
| doctors → clinics | doctors.clinic_id | **없음** ⚠️ |

> 복합 PK `(clinic_id, treatment_id)`는 clinic_id가 선두이므로 `WHERE clinic_id = ?`에 효율적이나 `WHERE treatment_id = ?`에는 비효율적.
> 복합 PK `(product_id, store_id)`는 product_id가 선두이므로 `WHERE store_id = ?`에 역방향 인덱스 필요.

### 3.3 경로 3: 관리자 목록 (api-spec.md §5.1, §5.5)

`repository.findAll()`은 필터 + 페이지네이션 + 정렬을 수행한다.

#### 공통 필터
- `status`: 모든 엔티티에 사용 (기본 `active`, 관리자는 `all` 가능)
- `search`: `name->>'ko' ILIKE` / `name->>'en' ILIKE` — JSONB 내부 텍스트 검색

#### 엔티티별 추가 필터 (api-spec.md §5.5)

| 엔티티 | 필터 컬럼 | 기존 인덱스 |
|--------|----------|-----------|
| products | category, brand_id, has_highlight(is_highlighted) | category ✅, brand_id **없음** ⚠️, is_highlighted ❌ (boolean, 제외) |
| stores | district, store_type | district ✅, store_type **없음** ⚠️ |
| clinics | district, clinic_type | district ✅, clinic_type **없음** ⚠️ |
| treatments | category | category ✅ |
| brands | tier, is_essenly | **없음** (MVP 데이터 소규모) ❌ |
| doctors | clinic_id | **없음** ⚠️ |

#### 정렬 필드 (search-engine.md §6.2)

| 엔티티 | 정렬 필드 | 기본값 |
|--------|----------|--------|
| products | created_at, updated_at, rating, price, review_count | created_at DESC |
| treatments | created_at, updated_at, rating, price_min, duration_minutes, downtime_days, review_count | created_at DESC |
| stores | created_at, updated_at, rating, district | created_at DESC |
| clinics | created_at, updated_at, rating, district | created_at DESC |
| brands | created_at, updated_at | created_at DESC |
| ingredients | created_at, updated_at | created_at DESC |
| doctors | created_at, updated_at | created_at DESC |

> 정렬 전용 인덱스는 MVP에서 생성하지 않는다. 관리자 목록은 페이지네이션(LIMIT 20)과 함께 사용되며, MVP 데이터 규모(수백 건)에서 정렬 비용은 무시할 수 있다. 데이터 1,000건 이상 시 `(status, created_at DESC)` 복합 인덱스를 검토한다.

### 3.4 RLS 패턴

사용자 데이터 테이블은 `auth.uid() = user_id` 또는 `auth.uid() = id`로 RLS가 적용된다. 해당 user_id 컬럼에 인덱스가 필요하다.

| 테이블 | RLS 조건 | 기존 인덱스 |
|--------|---------|-----------|
| users | auth.uid() = id | PK ✅ |
| user_profiles | auth.uid() = user_id | PK ✅ |
| journeys | auth.uid() = user_id | idx_journeys_user_id ✅ |
| conversations | auth.uid() = user_id | idx_conversations_user_id ✅ |
| messages | conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid()) | idx_messages_conversation_id ✅ + idx_conversations_user_id ✅ |
| beauty_history | auth.uid() = user_id | **없음** ⚠️ |
| learned_preferences | auth.uid() = user_id | idx_learned_preferences_user_id ✅ |
| behavior_logs | auth.uid() = user_id | idx_behavior_logs_user_id ✅ |
| consent_records | auth.uid() = user_id | PK(user_id) ✅ |

### 3.5 감사 로그 (api-spec.md §6.6)

`GET /api/admin/audit-logs` 필터: actor_id, action, target_type, target_id, from/to (created_at 범위).

모든 필터에 인덱스가 존재한다 (004_schema_v2.sql):
- idx_audit_logs_actor_id ✅
- idx_audit_logs_action ✅
- idx_audit_logs_target (target_type, target_id) ✅
- idx_audit_logs_created_at DESC ✅

---

## 4. 테이블별 인덱스 설계

범례: ✅ = 기존 유지, ⚠️ = 신규 추가, ❌ = 의도적 제외

### 4.1 사용자 데이터

#### users
- ✅ PK(id), UNIQUE(email) — 암묵적 인덱스

추가 불필요. users 테이블은 PK/UNIQUE로 충분.

#### user_profiles
- ✅ PK(user_id) — RLS + JOIN 커버

추가 불필요. 1:1 관계, PK가 모든 조회를 커버.

#### journeys
- ✅ idx_journeys_user_id — RLS + "활성 여정 조회"
- ✅ idx_journeys_status — `WHERE status = 'active'` 필터
- ❌ (status, user_id) 복합: 두 단일 인덱스가 bitmap AND로 결합 가능. MVP 규모에서 복합 불필요.

#### beauty_history
- ⚠️ **idx_beauty_history_user_id** — RLS `auth.uid() = user_id` + 사용자별 히스토리 조회. **누락됨.**
- ❌ type: 카디널리티 3 (treatment/purchase/visit). 순차 스캔 충분.

#### learned_preferences
- ✅ idx_learned_preferences_user_id — RLS + DV-1/DV-2 계산 시 사용자별 조회

#### conversations
- ✅ idx_conversations_user_id — RLS
- ✅ idx_conversations_journey_id — journey별 대화 조회

#### messages
- ✅ idx_messages_conversation_id — RLS 서브쿼리 + 대화 히스토리 로드
- ✅ idx_messages_created_at — 시간순 정렬

#### behavior_logs
- ✅ idx_behavior_logs_user_id — RLS + 사용자별 행동 조회
- ❌ event_type: 분석용, MVP에서 실시간 필터 없음
- ❌ (user_id, created_at): v0.2 행동 분석 시 추가 검토

#### consent_records
- ✅ PK(user_id) — 1:1, 모든 조회 커버

### 4.2 도메인 데이터 — 쇼핑 (DOM-1)

#### brands
- ✅ PK(id)
- ❌ status: MVP 브랜드 수 수십 건. 순차 스캔 충분.
- ❌ tier, is_essenly: 관리자 필터지만 데이터 소규모.

#### ingredients
- ✅ PK(id)
- ❌ status: MVP 성분 수 수백 건. 순차 스캔 충분.

#### products
- ✅ idx_products_status — `WHERE status = 'active'` (모든 검색 경로)
- ✅ idx_products_category — `WHERE category = ?`
- ✅ idx_products_skin_types (GIN) — `skin_types && ARRAY[...]`
- ✅ idx_products_concerns (GIN) — `concerns && ARRAY[...]`
- ⚠️ **idx_products_brand_id** — 관리자 필터 `brand_id = ?` + FK JOIN (products → brands). **누락됨.**
- ⚠️ **idx_products_price** — AI 검색 `price <= ?` (budget_max 필터). **누락됨.**
- ❌ is_highlighted: boolean, 카디널리티 2. 관리자 `has_highlight` 필터에 사용되나 선택도 낮아 효과 미미.
- ❌ rating, review_count: 정렬 전용. MVP 규모에서 불필요.
- ❌ embedding: MVP 벡터 인덱스 제외 (§1.3).

#### stores
- ✅ idx_stores_status — `WHERE status = 'active'`
- ✅ idx_stores_district — `WHERE district = ?`
- ⚠️ **idx_stores_store_type** — AI 검색 + 관리자 필터 `store_type = ?`. **누락됨.**
- ⚠️ **idx_stores_english_support** — AI 검색 `english_support = ?`. **누락됨.**
- ❌ location (GiST): MVP에서 위치 기반 검색 미구현 (v0.2). 인덱스 미리 생성 불필요.
- ❌ embedding: MVP 벡터 인덱스 제외.

### 4.3 도메인 데이터 — 시술 (DOM-2)

#### treatments
- ⚠️ **idx_treatments_status** — `WHERE status = 'active'` (모든 검색 경로). products/stores/clinics에는 있으나 treatments에 **누락됨.**
- ✅ idx_treatments_category — `WHERE category = ?`
- ✅ idx_treatments_target_concerns (GIN) — `target_concerns && ARRAY[...]`
- ✅ idx_treatments_suitable_skin_types (GIN) — `suitable_skin_types && ARRAY[...]`
- ⚠️ **idx_treatments_price_max** — AI 검색 `price_max <= ?` (budget_max 필터). 004에서 price_min/max 컬럼 추가됨, 인덱스 미생성. **누락됨.**
- ⚠️ **idx_treatments_downtime_days** — AI 검색 `downtime_days <= ?` (max_downtime 필터). **누락됨.**
- ❌ price_min: AI 검색에서 price_min 필터 없음 (budget_max는 price_max만 비교). 관리자 정렬 전용.
- ❌ duration_minutes: 관리자 정렬 전용. MVP 규모 불필요.
- ❌ embedding: MVP 벡터 인덱스 제외.

#### clinics
- ✅ idx_clinics_status — `WHERE status = 'active'`
- ✅ idx_clinics_district — `WHERE district = ?`
- ⚠️ **idx_clinics_clinic_type** — AI 검색 + 관리자 필터 `clinic_type = ?`. **누락됨.**
- ⚠️ **idx_clinics_english_support** — AI 검색 `english_support = ?`. **누락됨.**
- ❌ location (GiST): MVP 미구현.
- ❌ embedding: MVP 벡터 인덱스 제외.

#### doctors
- ⚠️ **idx_doctors_clinic_id** — FK JOIN (doctors → clinics) + 관리자 필터 `clinic_id = ?`. **누락됨.**
- ❌ status: MVP 의사 수 소규모.

### 4.4 관계 테이블

#### product_stores
- ✅ PK(product_id, store_id) — `WHERE product_id = ?` 커버 (선두 컬럼)
- ⚠️ **idx_product_stores_store_id** — `WHERE store_id = ?` 역방향 조회 (매장별 제품 목록). PK 선두가 product_id이므로 store_id 단독 조회 불가. **누락됨.**

#### product_ingredients
- ✅ PK(product_id, ingredient_id) — `WHERE product_id = ?` 커버
- ⚠️ **idx_product_ingredients_ingredient_id** — `WHERE ingredient_id = ?` 역방향 조회 (성분별 제품 목록). **누락됨.**

#### clinic_treatments
- ✅ PK(clinic_id, treatment_id) — `WHERE clinic_id = ?` 커버
- ⚠️ **idx_clinic_treatments_treatment_id** — `WHERE treatment_id = ?` 역방향 조회 (시술 상세에서 해당 시술 제공 클리닉 목록). **누락됨.**

### 4.5 관리자 시스템

#### admin_users
- ✅ PK(id), UNIQUE(email) — 로그인 시 이메일 조회, JWT 검증 시 ID 조회 커버
- ❌ status: 레코드 수 수 명~수십 명, 카디널리티 2. auth-matrix.md §5.1에서 authenticateAdmin()이 매 요청 조회하나, MVP 관리자 수(~50명)에서 순차 스캔 충분. v0.2+ 성능 이슈 시 재검토.
- ❌ role: 카디널리티 2. permissions 비트로 세분 관리.

#### audit_logs
- ✅ idx_audit_logs_actor_id
- ✅ idx_audit_logs_action
- ✅ idx_audit_logs_created_at DESC
- ✅ idx_audit_logs_target (target_type, target_id)

추가 불필요. 모든 조회 필터가 커버됨.

---

## 5. 신규 인덱스 마이그레이션 SQL

```sql
-- ============================================================
-- Migration 005: 인덱스 전략 적용 (P1-18)
-- 쿼리 패턴 분석 기반 누락 인덱스 추가
-- ============================================================

-- ============================================================
-- 5.1 사용자 데이터 — 누락 인덱스
-- ============================================================

-- beauty_history: RLS auth.uid() = user_id
CREATE INDEX IF NOT EXISTS idx_beauty_history_user_id
  ON beauty_history(user_id);

-- ============================================================
-- 5.2 도메인 데이터 — 쇼핑 (DOM-1)
-- ============================================================

-- products: 관리자 필터 brand_id + FK JOIN
CREATE INDEX IF NOT EXISTS idx_products_brand_id
  ON products(brand_id);

-- products: AI 검색 budget_max 필터 (price <= ?)
CREATE INDEX IF NOT EXISTS idx_products_price
  ON products(price);

-- stores: AI 검색 + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_stores_store_type
  ON stores(store_type);

CREATE INDEX IF NOT EXISTS idx_stores_english_support
  ON stores(english_support);

-- ============================================================
-- 5.3 도메인 데이터 — 시술 (DOM-2)
-- ============================================================

-- treatments: WHERE status = 'active' (모든 검색 경로)
CREATE INDEX IF NOT EXISTS idx_treatments_status
  ON treatments(status);

-- treatments: AI 검색 budget_max 필터 (price_max <= ?)
CREATE INDEX IF NOT EXISTS idx_treatments_price_max
  ON treatments(price_max);

-- treatments: AI 검색 max_downtime 필터 (downtime_days <= ?)
CREATE INDEX IF NOT EXISTS idx_treatments_downtime_days
  ON treatments(downtime_days);

-- clinics: AI 검색 + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_type
  ON clinics(clinic_type);

CREATE INDEX IF NOT EXISTS idx_clinics_english_support
  ON clinics(english_support);

-- doctors: FK JOIN + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id
  ON doctors(clinic_id);

-- ============================================================
-- 5.4 관계 테이블 — 역방향 조회 인덱스
-- ============================================================

-- product_stores: 매장별 제품 조회 (PK 선두 = product_id)
CREATE INDEX IF NOT EXISTS idx_product_stores_store_id
  ON product_stores(store_id);

-- product_ingredients: 성분별 제품 조회 (PK 선두 = product_id)
CREATE INDEX IF NOT EXISTS idx_product_ingredients_ingredient_id
  ON product_ingredients(ingredient_id);

-- clinic_treatments: 시술별 클리닉 조회 (PK 선두 = clinic_id)
CREATE INDEX IF NOT EXISTS idx_clinic_treatments_treatment_id
  ON clinic_treatments(treatment_id);
```

**신규 인덱스 합계: 14개**

| # | 인덱스명 | 테이블 | 타입 | 근거 |
|---|---------|--------|------|------|
| 1 | idx_beauty_history_user_id | beauty_history | B-tree | RLS 누락 |
| 2 | idx_products_brand_id | products | B-tree | FK JOIN + 관리자 필터 |
| 3 | idx_products_price | products | B-tree | AI 검색 budget_max |
| 4 | idx_stores_store_type | stores | B-tree | AI + 관리자 필터 |
| 5 | idx_stores_english_support | stores | B-tree | AI 검색 필터 |
| 6 | idx_treatments_status | treatments | B-tree | 모든 경로 WHERE |
| 7 | idx_treatments_price_max | treatments | B-tree | AI 검색 budget_max |
| 8 | idx_treatments_downtime_days | treatments | B-tree | AI 검색 max_downtime |
| 9 | idx_clinics_clinic_type | clinics | B-tree | AI + 관리자 필터 |
| 10 | idx_clinics_english_support | clinics | B-tree | AI 검색 필터 |
| 11 | idx_doctors_clinic_id | doctors | B-tree | FK JOIN + 관리자 필터 |
| 12 | idx_product_stores_store_id | product_stores | B-tree | 역방향 JOIN |
| 13 | idx_product_ingredients_ingredient_id | product_ingredients | B-tree | 역방향 JOIN |
| 14 | idx_clinic_treatments_treatment_id | clinic_treatments | B-tree | 역방향 JOIN |

---

## 6. 검증 체크리스트

### 6.1 설계 검증 (D-*)

```
[x] D-1: 모든 인덱스 컬럼이 schema.dbml에 존재하는가?
    → 14개 신규 인덱스의 모든 컬럼을 schema.dbml에서 확인 완료.
    → price_max, downtime_days는 004_schema_v2.sql에서 추가된 컬럼.

[x] D-1: search-engine.md §2.3 필터 매핑의 모든 컬럼이 커버되는가?
    → Products: skin_types(GIN), concerns(GIN), category, price — 모두 커버
    → Treatments: suitable_skin_types(GIN), target_concerns(GIN), category, price_max, downtime_days — 모두 커버
    → Stores: district, english_support, store_type — 모두 커버
    → Clinics: district, english_support, clinic_type — 모두 커버
    → search (name ILIKE): JSONB 텍스트 검색 — 인덱스 제외 (MVP 규모 순차 스캔 충분)

[x] D-1: api-spec.md §5.5 관리자 필터가 커버되는가?
    → Product: category ✅, brand_id ⚠️(신규), has_highlight ❌(boolean 제외)
    → Store: district ✅, store_type ⚠️(신규)
    → Clinic: district ✅, clinic_type ⚠️(신규)
    → Treatment: category ✅
    → Brand: tier, is_essenly ❌(소규모 제외)
    → Doctor: clinic_id ⚠️(신규)

[x] D-4: 인덱스 타입이 컬럼 타입과 호환되는가?
    → text[] 컬럼: GIN (기존 유지, 신규 해당 없음)
    → geography: GiST (v0.2 예정, MVP 미생성)
    → text, int, uuid: B-tree (기본, 신규 14개 모두)
    → vector(1024): MVP 미생성 (§1.3)

[x] 기존 23개 인덱스와 중복이 없는가?
    → 14개 신규 인덱스명이 기존과 겹치지 않음을 확인.
    → 동일 컬럼 중복 없음 (treatments.status만 기존에 누락).

[x] 불필요한 인덱스가 포함되지 않았는가?
    → boolean (is_highlighted, is_essenly, license_verified): 제외 ✅
    → JSONB display-only (card_data, tool_calls, metadata): 제외 ✅
    → 소규모 테이블 (brands, ingredients, admin_users): 최소 ✅
    → 벡터 (embedding): MVP 제외 ✅
```

### 6.2 시나리오 시뮬레이션 (D-2)

#### 시나리오 1: AI 검색 — "건성 피부에 맞는 2만원 이하 세럼"

```sql
-- repository.findByFilters() 생성 쿼리
SELECT * FROM products
WHERE status = 'active'                    -- idx_products_status
  AND skin_types && ARRAY['dry']           -- idx_products_skin_types (GIN)
  AND category = 'skincare'                -- idx_products_category
  AND price <= 20000                       -- idx_products_price (신규)
LIMIT 5;

-- 실행 계획 예상: Bitmap Index Scan on idx_products_skin_types
--   → Bitmap AND with idx_products_status, idx_products_category
--   → Filter: price <= 20000 (또는 idx_products_price)
-- 커버리지: 모든 WHERE 컬럼에 인덱스 존재 ✅
```

#### 시나리오 2: 카드 상세 — 시술 상세 + 클리닉 목록

```sql
-- repository.findById() + JOIN
SELECT t.*, ct.clinic_id, c.name
FROM treatments t
LEFT JOIN clinic_treatments ct ON ct.treatment_id = t.id
LEFT JOIN clinics c ON c.id = ct.clinic_id
WHERE t.id = '...';

-- 실행 계획 예상:
--   treatments: PK Index Scan ✅
--   clinic_treatments: idx_clinic_treatments_treatment_id (신규) ✅
--   clinics: PK Index Scan ✅
-- 역방향 JOIN 커버리지 확보 ✅
```

#### 시나리오 3: 관리자 목록 — 제품 목록 (브랜드 필터 + 정렬)

```sql
-- repository.findAll() 생성 쿼리
SELECT *, count(*) OVER() AS total
FROM products
WHERE status = 'active'                    -- idx_products_status
  AND brand_id = '...'                     -- idx_products_brand_id (신규)
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

-- 실행 계획 예상: Index Scan on idx_products_brand_id
--   → Filter: status = 'active'
--   → Sort: created_at DESC (in-memory, 소규모)
-- 커버리지: 필터 컬럼 인덱스 존재. 정렬은 MVP 규모에서 in-memory 충분. ✅
```

### 6.3 EXPLAIN ANALYZE 실행 계획 (배포 후)

인덱스 마이그레이션 적용 후, 아래 쿼리로 인덱스 사용 여부를 검증한다:

```sql
-- 1. 인덱스 존재 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 2. 경로 1 검증: AI 검색 (products)
EXPLAIN ANALYZE
SELECT * FROM products
WHERE status = 'active'
  AND skin_types && ARRAY['dry']
  AND price <= 20000
LIMIT 5;

-- 3. 경로 2 검증: 역방향 JOIN (treatment → clinics)
EXPLAIN ANALYZE
SELECT t.*, ct.clinic_id
FROM treatments t
JOIN clinic_treatments ct ON ct.treatment_id = t.id
WHERE t.id = gen_random_uuid();

-- 4. 경로 3 검증: 관리자 목록 (brand_id 필터)
EXPLAIN ANALYZE
SELECT * FROM products
WHERE status = 'active'
  AND brand_id = gen_random_uuid()
ORDER BY created_at DESC
LIMIT 20;

-- 5. RLS 검증: beauty_history (user_id)
EXPLAIN ANALYZE
SELECT * FROM beauty_history
WHERE user_id = gen_random_uuid();
```

---

## 7. v0.2+ 인덱스 로드맵

| 시점 | 인덱스 | 조건 |
|------|--------|------|
| v0.2 | `CREATE INDEX ... USING hnsw ON products(embedding vector_cosine_ops)` | 제품 1,000건 이상 |
| v0.2 | `CREATE INDEX ... USING hnsw ON treatments(embedding vector_cosine_ops)` | 시술 1,000건 이상 |
| v0.2 | `CREATE INDEX ... USING gist ON stores(location)` | 위치 기반 검색 구현 시 |
| v0.2 | `CREATE INDEX ... USING gist ON clinics(location)` | 위치 기반 검색 구현 시 |
| v0.2 | `(status, created_at DESC)` 복합 인덱스 (주요 테이블) | 데이터 1,000건 이상 + 관리자 목록 성능 이슈 시 |
| v0.3 | `CREATE INDEX ... ON behavior_logs(user_id, created_at)` | 행동 분석 기능 구현 시 |
