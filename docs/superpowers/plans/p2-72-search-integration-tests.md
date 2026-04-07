# P2-72: Search Integration Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST API 4개 도메인의 필터 정확성 + Vector RPC 2개(match_products, match_treatments)의 실제 DB 동작을 통합 테스트로 검증.

**Architecture:** P2-71에서 구축한 통합 테스트 인프라(vitest.integration.config.ts, helpers.ts, setup.ts)를 그대로 재사용. 신규 파일 2개만 추가. production 코드 수정 0건. 테스트 코드는 `src/__tests__/integration/`에 독립 배치하여 비즈니스/코어 코드에 역참조 0건.

**Tech Stack:** Vitest 4.x (node env) + Hono `app.request()` + Supabase JS v2 (`service_role` RPC 호출) + 기존 route 코드 (수정 없이 호출만)

**전제:** dev Supabase DB에 P2-60~64 시드 데이터 + P2-64d 임베딩 존재. 미존재 시 해당 테스트는 `describe.skipIf()`로 스킵.

**P2-73과의 경계:** P2-72는 DB 필터 + RPC 기계적 정확성. Chat route → service → tools 오케스트레이션은 P2-73 범위.

---

## File Structure

| 구분 | 파일 | 책임 |
|------|------|------|
| Create | `src/__tests__/integration/search-filter-routes.integration.test.ts` | REST API 4개 도메인 필터 정확성 (41건) |
| Create | `src/__tests__/integration/search-vector-rpc.integration.test.ts` | Vector RPC match_products/match_treatments (10건) |

**의존 방향 (단방향만):**
```
search-filter-routes.integration.test.ts
  → src/server/features/api/app.ts        (createApp)
  → src/server/features/api/routes/*.ts   (registerXxxRoutes)
  → src/__tests__/integration/helpers.ts  (createVerifyClient — 데이터 존재 확인용)

search-vector-rpc.integration.test.ts
  → src/__tests__/integration/helpers.ts  (createVerifyClient — RPC 호출용)
  → @supabase/supabase-js                (직접 사용)

역방향 없음:
  src/server/ → src/__tests__/ ✗
  src/client/ → src/__tests__/ ✗
  src/shared/ → src/__tests__/ ✗
```

**production 코드 수정: 0건.** 모든 변경은 테스트 파일에만 한정.

---

## 규칙 준수 검증

| 규칙 | 준수 방법 |
|------|----------|
| P-1 DAG | 테스트 → server/ 단방향. 역방향 없음 |
| P-2 Core 불변 | core/ 수정 0건 |
| P-10 제거 안전성 | 테스트 2파일 삭제해도 core/features/client/shared에 영향 0 |
| R-1~R-4 계층 의존 | 테스트는 app 계층에서 route만 import. 계층 위반 없음 |
| L-0a server-only | setup.ts에서 vi.mock('server-only') — 기존 패턴 재사용 |
| G-1 기존 코드 분석 | P2-71 테스트 패턴 전수 분석 완료 |
| G-2 중복 금지 | helpers.ts 재사용, 신규 헬퍼 미생성 |
| G-4 미사용 코드 금지 | 모든 export/함수가 테스트에서 사용됨 |
| G-5 기존 패턴 따르기 | domain-read-routes 패턴과 동일 구조 |
| V-17 제거 안전성 | 테스트 파일 삭제 시 빌드 영향 0 |

---

## Task 1: search-filter-routes.integration.test.ts

**Files:**
- Create: `src/__tests__/integration/search-filter-routes.integration.test.ts`

### 구조

```
describe('Search filters (integration)')
  beforeAll: createApp() + register4Routes + 데이터 존재 확인
  
  describe('Products')
    P-S01 ~ P-S07 (단일 필터 7건)
    P-C01 ~ P-C03 (복합 필터 3건)
    P-Z01 ~ P-Z02 (빈 결과 2건)

  describe('Treatments')
    T-S01 ~ T-S08 (단일 필터 8건)
    T-C01 ~ T-C03 (복합 필터 3건)
    T-Z01 (빈 결과 1건)

  describe('Stores')
    S-S01 ~ S-S06 (단일 필터 6건)
    S-C01 ~ S-C02 (복합 필터 2건)
    S-Z01 (빈 결과 1건)

  describe('Clinics')
    C-S01 ~ C-S06 (단일 필터 6건)
    C-C01 (복합 필터 1건)
    C-Z01 (빈 결과 1건)
```

### 검증 패턴

모든 필터 테스트는 동일한 2단계 검증:
1. **구조 검증**: `res.status === 200`, `Array.isArray(json.data)`, `typeof json.meta.total === 'number'`
2. **필터 정확성**: `json.data`의 **모든 항목**이 필터 조건 충족

단일 필터: `count < baseline` (필터가 결과를 감소시키는지)
복합 필터: 모든 항목이 모든 조건 동시 충족 (AND 정확성)
빈 결과: `json.data.length === 0`, `json.meta.total === 0`

### 테스트 케이스 상세

**Products (12건)**

| ID | 쿼리 파라미터 | 검증 |
|----|-------------|------|
| P-S01 | (없음) | count > 0, 기준값 저장 |
| P-S02 | `?skin_types=oily` | count < baseline, 모든 항목 skin_types에 'oily' 포함 |
| P-S03 | `?concerns=acne,wrinkles` | count < baseline, 모든 항목 concerns가 ['acne','wrinkles']와 overlap |
| P-S04 | `?category=skincare` | count < baseline, 모든 항목 category==='skincare' |
| P-S05 | `?budget_max=15000` | count < baseline, 모든 항목 price ≤ 15000 |
| P-S06 | `?search=serum` | count < baseline, 모든 항목 name.en 또는 name.ko에 'serum' 포함 (case-insensitive) |
| P-S07 | `?search=이니스프리` | count < baseline, 모든 항목 name.ko에 '이니스프리' 포함 |
| P-C01 | `?skin_types=dry&category=skincare` | 모든 항목이 두 조건 동시 충족 |
| P-C02 | `?skin_types=oily&budget_max=20000` | 모든 항목이 두 조건 동시 충족 |
| P-C03 | `?category=skincare&search=cream` | 모든 항목이 두 조건 동시 충족 |
| P-Z01 | `?category=tools&budget_max=1` | data=[], total=0 |
| P-Z02 | `?search=zzz_nonexistent_xyz` | data=[], total=0 |

**Treatments (12건)**

| ID | 쿼리 파라미터 | 검증 |
|----|-------------|------|
| T-S01 | (없음) | count > 0 |
| T-S02 | `?skin_types=sensitive` | 모든 항목 suitable_skin_types에 'sensitive' 포함 |
| T-S03 | `?concerns=pores` | 모든 항목 target_concerns에 'pores' 포함 |
| T-S04 | `?category=laser` | 모든 항목 category==='laser' |
| T-S05 | `?budget_max=100000` | 모든 항목 price_max ≤ 100000 |
| T-S06 | `?max_downtime=1` | 모든 항목 downtime_days ≤ 1 |
| T-S07 | `?search=laser` | 모든 항목 name에 'laser' 포함 |
| T-S08 | `?search=레이저` | 모든 항목 name.ko에 '레이저' 포함 |
| T-C01 | `?skin_types=oily&max_downtime=3` | 모든 항목이 두 조건 동시 충족 |
| T-C02 | `?category=injection&budget_max=200000` | 모든 항목이 두 조건 동시 충족 |
| T-C03 | `?concerns=acne&category=facial&max_downtime=7` | 모든 항목이 세 조건 동시 충족 |
| T-Z01 | `?category=body&budget_max=1` | data=[], total=0 |

**Stores (9건)**

| ID | 쿼리 파라미터 | 검증 |
|----|-------------|------|
| S-S01 | (없음) | count > 0 |
| S-S02 | `?district=gangnam` | 모든 항목 district==='gangnam' |
| S-S03 | `?store_type=olive_young` | 모든 항목 store_type==='olive_young' |
| S-S04 | `?english_support=good` | 모든 항목 english_support==='good' |
| S-S05 | `?query=olive` | 모든 항목 name.en 또는 name.ko에 'olive' 포함 |
| S-S06 | `?query=올리브영` | 모든 항목 name.ko에 '올리브영' 포함 |
| S-C01 | `?district=gangnam&store_type=olive_young` | 모든 항목이 두 조건 동시 충족 |
| S-C02 | `?district=myeongdong&query=다이소` | 모든 항목이 두 조건 동시 충족 |
| S-Z01 | `?district=gangnam&store_type=pharmacy&english_support=good` | data=[], total=0 |

**Clinics (8건)**

| ID | 쿼리 파라미터 | 검증 |
|----|-------------|------|
| C-S01 | (없음) | count > 0 |
| C-S02 | `?district=gangnam` | 모든 항목 district==='gangnam' |
| C-S03 | `?clinic_type=dermatology` | 모든 항목 clinic_type==='dermatology' |
| C-S04 | `?english_support=none` | 모든 항목 english_support==='none' |
| C-S05 | `?query=derma` | 모든 항목 name에 'derma' 포함 |
| C-S06 | `?query=피부과` | 모든 항목 name.ko에 '피부과' 포함 |
| C-C01 | `?district=gangnam&clinic_type=dermatology` | 모든 항목이 두 조건 동시 충족 |
| C-Z01 | `?query=zzz_nonexistent_xyz` | data=[], total=0 |

- [ ] **Step 1: 테스트 파일 작성** (아래 Task 1 코드 참조)
- [ ] **Step 2: 로컬 실행 검증** `npm run test:integration -- --testPathPattern search-filters`
- [ ] **Step 3: 커밋**

---

## Task 2: search-vector-rpc.integration.test.ts

**Files:**
- Create: `src/__tests__/integration/search-vector-rpc.integration.test.ts`

### 구조

```
describe('Vector search RPC (integration)')
  beforeAll: createVerifyClient + 임베딩 데이터 존재 확인
  describe.skipIf(!hasEmbeddings)

  describe('match_products')
    V-P01: 자기 매칭 (similarity > 0.99)
    V-P02: 반환 컬럼 스키마 검증
    V-P03: match_count 제한 준수
    V-P04: filter_skin_types 적용
    V-P05: filter_max_price 적용
    V-P06: 필터+벡터 조합 결과 감소

  describe('match_treatments')
    V-T01: 자기 매칭 (similarity > 0.99)
    V-T02: filter_max_downtime 적용
    V-T03: filter_skin_types + filter_concerns 복합
    V-T04: 반환 컬럼 스키마 검증
```

### 검증 패턴

- **자기 매칭**: DB에서 제품/시술 1건의 embedding 읽기 → 동일 벡터로 RPC 호출 → 해당 항목이 결과에 포함 + similarity > 0.99
- **스키마 검증**: RPC 반환 컬럼이 012_expand_rpc_columns.sql 정의와 일치
- **필터 검증**: 필터 적용 시 모든 결과가 조건 충족
- **RPC 직접 호출**: `createVerifyClient().rpc('match_products', { ... })` — production 코드 import 없음

### 임베딩 획득 방식

```typescript
// DB에서 active 제품 1건의 embedding을 직접 읽기 (service_role)
const { data: sample } = await client
  .from('products')
  .select('id, embedding, skin_types, category, price')
  .eq('status', 'active')
  .not('embedding', 'is', null)
  .limit(1)
  .single();

// 읽어온 embedding을 그대로 RPC 쿼리 벡터로 사용
const { data: results } = await client.rpc('match_products', {
  query_embedding: sample.embedding,
  match_count: 5,
});
```

**production 코드 import 0건** — `@supabase/supabase-js`만 직접 사용.

### 테스트 케이스 상세

**match_products (6건)**

| ID | 테스트 | 검증 |
|----|--------|------|
| V-P01 | 제품 A의 embedding → RPC 호출 | A가 결과에 포함, similarity > 0.99 |
| V-P02 | 결과 첫 항목의 키 검사 | id, name, category, skin_types, concerns, price, similarity 등 필수 컬럼 존재 |
| V-P03 | match_count=3 | results.length ≤ 3 |
| V-P04 | filter_skin_types=['oily'] | 모든 결과의 skin_types에 'oily' 포함 |
| V-P05 | filter_max_price=15000 | 모든 결과의 price ≤ 15000 |
| V-P06 | 필터 없음 vs 필터 있음 | 필터 적용 시 results.length ≤ 필터 없음 results.length |

**match_treatments (4건)**

| ID | 테스트 | 검증 |
|----|--------|------|
| V-T01 | 시술 B의 embedding → RPC 호출 | B가 결과에 포함, similarity > 0.99 |
| V-T02 | filter_max_downtime=1 | 모든 결과의 downtime_days ≤ 1 |
| V-T03 | filter_skin_types + filter_concerns | 모든 결과가 두 조건 동시 충족 |
| V-T04 | 결과 첫 항목의 키 검사 | 필수 컬럼 존재 (21개 + similarity) |

- [ ] **Step 1: 테스트 파일 작성** (아래 Task 2 코드 참조)
- [ ] **Step 2: 로컬 실행 검증** `npm run test:integration -- --testPathPattern search-vector`
- [ ] **Step 3: 커밋**

---

## 독립성 검증

### 비즈니스/코어 코드 영향 분석

| 파일 | 수정 여부 | 역참조 |
|------|----------|--------|
| src/server/core/* | 수정 없음 | 테스트 → core 참조 없음 (helpers.ts가 독립 클라이언트 생성) |
| src/server/features/* | 수정 없음 | 테스트 → routes만 import (registerXxxRoutes) |
| src/client/* | 수정 없음 | 테스트 → client 참조 없음 |
| src/shared/* | 수정 없음 | 테스트 → shared 참조 없음 |
| helpers.ts | 수정 없음 | 기존 P2-71 헬퍼 그대로 재사용 |

### 모듈 삭제 안전성

두 테스트 파일을 삭제해도:
- `npm run build` 정상 (테스트 파일은 빌드 대상 아님)
- `npm test` 정상 (단위 테스트에 영향 없음)
- `npm run test:integration` 정상 (해당 파일만 미실행)
- 다른 테스트 파일에서 이 파일을 import하지 않음 (역참조 0건)
