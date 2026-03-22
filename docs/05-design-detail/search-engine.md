# 검색/필터/판단 엔진 설계 — P1-42 ~ P1-46

> 버전: 1.1
> 작성일: 2026-03-22
> 근거: PRD §4-A, schema.dbml, api-spec.md, auth-matrix.md, PoC P0-19~22, CLAUDE.md R-7/R-8/R-6
> 원칙: beauty/ = 순수 함수 (DB 금지). repositories/ = CRUD만 (비즈니스 금지). core/ = 비즈니스 무관.

---

## 목차

1. [검색 아키텍처 개요](#1-검색-아키텍처-개요)
2. [구조화 검색 쿼리 (P1-42)](#2-구조화-검색-쿼리-p1-42)
3. [뷰티 판단 엔진 (P1-43)](#3-뷰티-판단-엔진-p1-43)
4. [벡터 검색 파이프라인 (P1-44)](#4-벡터-검색-파이프라인-p1-44)
5. [하이브리드 검색 전략 (P1-45)](#5-하이브리드-검색-전략-p1-45)
6. [정렬/랭킹 로직 (P1-46)](#6-정렬랭킹-로직-p1-46)

---

# 1. 검색 아키텍처 개요

## 1.1 검색 경로 3개

이 서비스에서 사용자는 제품 목록을 직접 브라우징하지 않는다. 모든 검색은 **AI 대화를 통해 LLM tool이 실행**한다 (sitemap.md: Chat 페이지만 존재, 제품 목록 페이지 없음).

```
[경로 1: AI 대화 검색 — MVP 핵심]
  POST /api/chat
    → chatService → tool: search_beauty_data
      → repository.findByFilters(client, filters, limit: 5)
      → beauty.rank(results, userProfile)
      → return top N cards to LLM

[경로 2: 카드 상세 — MVP]
  GET /api/products/:id
    → repository.findById(client, id)
    → return full entity

[경로 3: 관리자 목록 — MVP]
  GET /api/admin/products?page=1&pageSize=20&sort=created_at&order=desc
    → repository.findAll(client, filters, pagination, sort)
    → return { data, total }
```

## 1.2 페이지네이션/정렬 필요 여부

| 경로 | 페이지네이션 | 정렬 | 총 건수 | 이유 |
|------|------------|------|--------|------|
| AI 대화 (경로 1) | **불필요** | **서버 결정** (판단 엔진) | **불필요** | LLM이 top 3~5만 요청 |
| 카드 상세 (경로 2) | **불필요** | **불필요** | **불필요** | 단일 엔티티 |
| 관리자 목록 (경로 3) | **필수** | **필수** | **필수** | 목록 UI (api-spec §5.1) |

## 1.3 코드 배치 (CLAUDE.md 규칙)

```
server/core/
  └── knowledge.ts              # 임베딩 생성 + pgvector RPC 래핑 (L-5: 비즈니스 무관)

server/features/
  ├── repositories/
  │   ├── query-utils.ts        # 공통 필터/페이지네이션/정렬 유틸 (R-8: CRUD만)
  │   ├── product-repository.ts # findByFilters, matchByVector, findById, findAll
  │   ├── treatment-repository.ts
  │   ├── store-repository.ts
  │   └── clinic-repository.ts
  │
  ├── beauty/                   # 순수 함수 (R-7: DB/API 호출 금지)
  │   ├── judgment.ts           # rank() — 5단계 판단 + 랭킹
  │   ├── shopping.ts           # 쇼핑 도메인 판단 → judgment.ts
  │   ├── treatment.ts          # 시술 도메인 판단 (다운타임 규칙) → judgment.ts
  │   └── derived.ts            # DV-1~3 계산 (독립)
  │
  └── chat/tools/
      └── search-handler.ts     # tool에서 repository + beauty 조합 (R-6 허용)
```

### 의존성 방향 (단방향, 순환 없음)

```
search-handler (chat/tools/)
  ├──→ repositories/* (R-6 허용)
  └──→ beauty/* (R-6 허용)

repositories/*
  ├──→ query-utils.ts (같은 폴더)
  └──→ shared/types (타입만)

beauty/*
  └──→ shared/types, shared/constants (타입/상수만)

core/knowledge.ts
  └──→ 외부 라이브러리만 (@ai-sdk, @supabase)
```

---

# 2. 구조화 검색 쿼리 (P1-42)

## 2.1 Repository 메서드 3개

모든 엔티티 repository에 동일한 3개 메서드를 제공한다.

### findByFilters — AI tool용

```typescript
async function findByFilters(
  client: SupabaseClient,
  filters: EntityFilters,   // 엔티티별 타입
  limit: number = 5
): Promise<Entity[]>
```

- **용도**: AI tool (search_beauty_data)에서 호출
- **페이지네이션**: 없음. `LIMIT`만
- **정렬**: 없음 (ORDER BY 생략). beauty.rank()가 최종 정렬을 담당하므로 SQL 정렬은 낭비
- **null-safe (VP-3)**: filters의 null/undefined 필드는 WHERE 절에서 생략

### matchByVector — AI tool 벡터 검색용

```typescript
async function matchByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: EntityFilters,
  limit: number = 5
): Promise<(Entity & { similarity: number })[]>
```

- **용도**: 자연어 쿼리 시 벡터 유사도 검색
- **구현**: pgvector RPC 함수 호출 (`match_products`, `match_treatments`)
- **필터**: RPC 함수 내 WHERE 절 (003_vector_search_functions.sql)

### findById — 카드 상세용

```typescript
async function findById(
  client: SupabaseClient,
  id: string
): Promise<Entity | null>
```

- **용도**: `GET /api/{entity}/:id`
- 관계 데이터 포함 (JOIN): product → brand, treatment → clinics

### findAll — 관리자용

```typescript
async function findAll(
  client: SupabaseClient,
  filters: AdminFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' }
): Promise<{ data: Entity[]; total: number }>
```

- **용도**: `GET /api/admin/{entity}`
- **페이지네이션**: `LIMIT pageSize OFFSET (page - 1) * pageSize`
- **총 건수**: Supabase `{ count: 'exact', head: false }` 옵션
- **정렬**: 허용 필드 목록으로 검증 (SQL injection 방지)
- **status 필터**: `all`이면 WHERE 절 생략. 기본 = `active`만

## 2.2 공통 필터 유틸 (query-utils.ts)

모든 repository에서 재사용. SQL 연산자만 다루며 비즈니스 로직 없음.

### 필터 함수

```typescript
// 배열 겹침 (OR): skin_types && ARRAY['dry','oily']
function applyArrayOverlap(query, column: string, values: string[] | undefined)
  → values가 null/undefined이면 query 그대로 반환 (VP-3)
  → 아니면 query.overlaps(column, values)

// 배열 포함: concerns @> ARRAY['acne']
function applyArrayContains(query, column: string, values: string[] | undefined)
  → query.contains(column, values)

// 정확 일치: category = 'skincare'
function applyExact(query, column: string, value: string | undefined)
  → query.eq(column, value)

// 범위 (이하): price <= 20000
function applyMax(query, column: string, value: number | undefined)
  → query.lte(column, value)

// 범위 (이상): price >= 10000
function applyMin(query, column: string, value: number | undefined)
  → query.gte(column, value)

// 텍스트 검색 (JSONB ILIKE): name->>'ko' ILIKE '%cosrx%'
function applyTextSearch(query, column: string, text: string | undefined)
  → query.or(`${column}->>ko.ilike.%${text}%,${column}->>en.ilike.%${text}%`)
```

모든 함수는 **value가 null/undefined이면 query를 수정하지 않고 반환** → VP-3 null-safe.

### 페이지네이션 함수

```typescript
// 관리자 API용
function applyPagination(query, page: number, pageSize: number)
  → query.range((page - 1) * pageSize, page * pageSize - 1)

// AI tool용 (단순 LIMIT)
function applyLimit(query, limit: number)
  → query.limit(limit)
```

### 정렬 함수

```typescript
// 허용 필드 검증 + 적용
function applySort(query, field: string, order: 'asc' | 'desc', allowedFields: string[])
  → field가 allowedFields에 없으면 기본값 사용
  → query.order(field, { ascending: order === 'asc' })
```

## 2.3 엔티티별 필터 매핑

### Products

| 파라미터 | 컬럼 | 유틸 함수 | SQL |
|---------|------|----------|-----|
| `skin_types` | skin_types | applyArrayOverlap | `skin_types && ARRAY[...]` |
| `concerns` | concerns | applyArrayOverlap | `concerns && ARRAY[...]` (하나라도 겹침) |
| `category` | category | applyExact | `category = ?` |
| `budget_max` | price | applyMax | `price <= ?` |
| `search` | name | applyTextSearch | `name->>'ko' ILIKE ...` |

> `concerns`에 `&&` (overlap) 사용: 사용자 고민 중 하나라도 다루는 제품을 포함. `@>` (contains)는 모두 포함해야 하므로 너무 엄격.

**허용 정렬 (관리자)**: `created_at`, `updated_at`, `rating`, `price`, `review_count`

### Treatments

| 파라미터 | 컬럼 | 유틸 함수 | SQL |
|---------|------|----------|-----|
| `skin_types` | suitable_skin_types | applyArrayOverlap | `suitable_skin_types && ARRAY[...]` |
| `concerns` | target_concerns | applyArrayOverlap | `target_concerns && ARRAY[...]` (하나라도 겹침) |
| `category` | category | applyExact | `category = ?` |
| `budget_max` | price_max | applyMax | `price_max <= ?` |
| `max_downtime` | downtime_days | applyMax | `downtime_days <= ?` |
| `search` | name | applyTextSearch | `name->>'ko' ILIKE ...` |

> `budget_max`는 SQL WHERE에서만 처리 (단순 범위 비교). beauty/ 함수에서 중복 체크하지 않음. beauty/ 3단계는 **다운타임 계산만** 담당.

**허용 정렬 (관리자)**: `created_at`, `updated_at`, `rating`, `price_min`, `duration_minutes`, `downtime_days`, `review_count`

### Stores

| 파라미터 | 컬럼 | 유틸 함수 | SQL |
|---------|------|----------|-----|
| `district` | district | applyExact | `district = ?` |
| `english_support` | english_support | applyExact | `english_support = ?` |
| `store_type` | store_type | applyExact | `store_type = ?` |
| `search` | name | applyTextSearch | `name->>'ko' ILIKE ...` |

**허용 정렬 (관리자)**: `created_at`, `updated_at`, `rating`, `district`

> `name` 정렬 제외: JSONB 컬럼을 직접 ORDER BY하면 JSON 직렬화 순서로 정렬되어 무의미. 언어별 정렬 (name->>'ko') 필요 시 v0.2에서 구현.

### Clinics

| 파라미터 | 컬럼 | 유틸 함수 | SQL |
|---------|------|----------|-----|
| `district` | district | applyExact | `district = ?` |
| `english_support` | english_support | applyExact | `english_support = ?` |
| `clinic_type` | clinic_type | applyExact | `clinic_type = ?` |
| `search` | name | applyTextSearch | `name->>'ko' ILIKE ...` |

**허용 정렬 (관리자)**: `created_at`, `updated_at`, `rating`, `district`

> `name` 정렬 제외 (전 엔티티 공통): JSONB 컬럼을 직접 ORDER BY하면 JSON 직렬화 순서로 정렬되어 무의미. 언어별 정렬 (`name->>'ko'`) 필요 시 v0.2에서 구현.

## 2.4 buildBaseQuery — 공통 쿼리 빌드

```typescript
function buildBaseQuery(client: SupabaseClient, table: string, filters: Record<string, unknown>) {
  let query = client.from(table).select('*').eq('status', 'active');

  // 엔티티별 필터 맵에서 순회하며 적용
  // null/undefined 필터는 자동 스킵 (VP-3)
  for (const [param, config] of filterMap) {
    const value = filters[param];
    if (value == null) continue;
    query = config.apply(query, config.column, value);
  }

  return query;
}
```

> `findByFilters`와 `findAll`이 이 함수를 공유. findAll은 이 결과에 pagination + sort + count를 추가.

---

# 3. 뷰티 판단 엔진 (P1-43)

## 3.1 5단계 판단 (PRD §4-A)

| 단계 | 입력 | 로직 | 구현 위치 | 성격 |
|------|------|------|----------|------|
| 1. 적합성 필터 | UP-1 skin_type | `skin_types && ARRAY[user.skin_type]` | Repository (SQL WHERE) | **하드 필터** |
| 2. 고민 매칭 | JC-1 concerns | `concerns && ARRAY[user.concerns]` | Repository (SQL WHERE) | **하드 필터** |
| 3. 제약 조건 체크 | JC-3 stay_days, RT-2 시간 | downtime < 잔여일 (날짜 계산 = 비즈니스 로직). budget/price는 1단계 SQL에서 이미 처리 | beauty/ 순수 함수 | **하드 필터** |
| 4. 개인화 정렬 | DV-1 선호 성분, DV-2 기피 성분 | 선호 성분 포함 우선, 기피 성분 제외 | beauty/ 순수 함수 | **소프트 랭킹** |
| 5. 하이라이트 | is_highlighted | 배지 플래그 추가. **순위 미영향 (VP-1)** | beauty/ 순수 함수 | **표시만** |

### SQL vs 코드 분담 원칙

```
[Repository — SQL WHERE] 하드 필터 1~2단계
  성능: DB에서 걸러야 불필요한 데이터 전송 없음
  조건: 단순 배열 겹침/범위 비교 — SQL로 표현 가능

[beauty/ — 순수 함수] 하드 필터 3단계 + 소프트 랭킹 4~5단계
  이유: 다운타임 계산(잔여일 = 종료일 - 오늘)은 비즈니스 로직
  이유: DV-1/2 성분 매칭은 product_ingredients JOIN + 가중치 계산
  이유: 순위/점수 산정은 코드에서만 유연하게 조정 가능
```

## 3.2 beauty/ 함수 시그니처

### judgment.ts — 공통 랭킹

```typescript
// 5단계 판단 후 정렬된 결과 반환
function rank(
  items: Entity[],
  profile: UserProfile,      // UP-1~4
  journey: JourneyContext,   // JC-1~5, stay_days, end_date
  preferences: LearnedPreference[]  // BH-4 (DV-1/2 계산용)
): RankedEntity[]

interface RankedEntity {
  entity: Entity;
  score: number;             // 종합 점수 (0~1)
  reasons: string[];         // why_recommended 근거
  warnings: string[];        // 다운타임 경고 등
  is_highlighted: boolean;   // VP-1: 순위 미영향
}
```

### treatment.ts — 시술 도메인 (다운타임 규칙)

```typescript
// PRD §4-A 시술 추천 규칙
function checkDowntime(
  treatment: Treatment,
  remainingDays: number      // 잔여 체류일
): { eligible: boolean; warning: boolean; reason: string }

// 잔여 체류일 계산
function calculateRemainingDays(
  endDate: Date | null,
  stayDays: number | null,
  today: Date
): number | null
  → endDate 있으면: endDate - today
  → endDate 없으면: stayDays (폴백, 과대평가 가능)
  → 둘 다 없으면: null (다운타임 체크 스킵, VP-3)
```

### shopping.ts — 쇼핑 도메인

```typescript
// DV-1/2 기반 제품 개인화 점수
function scoreProduct(
  product: Product,
  preferredIngredients: string[],  // DV-1
  avoidedIngredients: string[]     // DV-2
): { score: number; reasons: string[] }
```

### derived.ts — 도출 변수 계산 (독립)

```typescript
// DV-1: 선호 성분 (skin_type + concerns → 성분 매핑)
function calculatePreferredIngredients(skinType, concerns, learnedLikes): string[]

// DV-2: 기피 성분 (skin_type → 주의 성분 + dislike)
function calculateAvoidedIngredients(skinType, learnedDislikes): string[]

// DV-3: 사용자 세그먼트 (마케팅용, 추천 미사용)
function calculateSegment(ageRange, interests, budget, travelStyle): string

// DV-4: AI Beauty Profile — derived.ts 범위 외
// LLM이 모든 변수 + DV-1~3을 종합하여 자연어 프로필을 생성.
// 구현: features/chat/service.ts 또는 features/profile/service.ts에서 LLM 호출.
// derived.ts는 순수 함수이므로 LLM 호출 불가 (R-7).
```

---

# 4. 벡터 검색 파이프라인 (P1-44)

## 4.1 파이프라인

```
사용자 쿼리 (자연어)
  │
  ├─ core/knowledge.ts: embed(query, RETRIEVAL_QUERY)
  │  → 1024d 벡터 생성 (gemini-embedding-001 / voyage-3-large)
  │
  ├─ repository.matchByVector(client, embedding, filters, limit)
  │  → supabase.rpc('match_products', { query_embedding, match_count, filter_* })
  │  → pgvector: ORDER BY embedding <=> query_embedding
  │  → SQL WHERE 필터 동시 적용 (RPC 함수 내)
  │
  └─ 결과: Entity[] with similarity score
```

## 4.2 core/knowledge.ts 인터페이스

```typescript
// 비즈니스 무관. 임베딩 모델만 래핑.
async function embedQuery(text: string): Promise<number[]>
  → getEmbeddingModel() + embed({ value: text, providerOptions: RETRIEVAL_QUERY })
  → return embedding (1024d)

async function embedDocument(text: string): Promise<number[]>
  → 동일, taskType: RETRIEVAL_DOCUMENT
```

> L-5 준수: skin_type, concerns 등 K-뷰티 용어 없음. 텍스트와 벡터만 다룸.

## 4.3 벡터 vs SQL 선택 기준

| 쿼리 유형 | 검색 방식 | 이유 |
|----------|----------|------|
| "건성 피부에 좋은 세럼" | **SQL 필터** | skin_type + category 정확 매칭 가능 |
| "여행 중 피곤한 피부에 활력" | **벡터 검색** | 의미 검색 필요 (키워드 불일치) |
| "보습 세럼 추천" + 프로필 있음 | **하이브리드** | SQL 필터 (skin_type) + 벡터 (보습 의미) |

**선택 로직**: LLM이 tool 파라미터에서 결정.
- `query`만 있고 `filters` 없음 → 벡터 검색
- `filters`만 있고 `query` 없음 → SQL 필터
- 둘 다 있음 → 하이브리드

---

# 5. 하이브리드 검색 전략 (P1-45)

## 5.1 전략: 단일 RPC 쿼리 (PoC 검증 완료)

```sql
-- match_products RPC 함수 (003_vector_search_functions.sql)
SELECT *, 1 - (embedding <=> query_embedding) AS similarity
FROM products
WHERE status = 'active'
  AND (filter_skin_types IS NULL OR skin_types && filter_skin_types)
  AND (filter_concerns IS NULL OR concerns && filter_concerns)
  AND (filter_max_price IS NULL OR price <= filter_max_price)
ORDER BY embedding <=> query_embedding
LIMIT match_count;
```

**SQL 필터 + 벡터 정렬이 단일 쿼리에서 동시 실행.** 2단계 (SQL → 벡터) 불필요.

## 5.2 벡터 없이 SQL만 사용하는 경우

벡터 검색이 불필요할 때 (필터만으로 충분할 때):

```typescript
// search-handler 내부 분기
if (params.query && !hasExactFilters(params)) {
  // 벡터 검색: 의미 매칭 필요
  const embedding = await embedQuery(params.query);
  results = await repository.matchByVector(client, embedding, filters, limit);
} else {
  // SQL 검색: 필터만으로 충분
  results = await repository.findByFilters(client, filters, limit);
}
```

---

# 6. 정렬/랭킹 로직 (P1-46)

## 6.1 AI 대화 검색 — 서버 랭킹 (경로 1)

사용자가 정렬 기준을 선택하지 않는다. 판단 엔진이 결정.

### 랭킹 기준 (우선순위)

| 순위 | 기준 | 가중치 | 산정 |
|------|------|--------|------|
| 1 | **제약 조건 통과** | 필수 | downtime 초과 → 제외, budget 초과 → 제외 |
| 2 | **적합성 점수** | 0.4 | skin_type 매치 + concerns 매치 비율 |
| 3 | **개인화 점수** | 0.3 | DV-1 선호 성분 포함 비율 - DV-2 기피 성분 포함 비율 |
| 4 | **벡터 유사도** | 0.2 | pgvector similarity (0~1) |
| 5 | **평점** | 0.1 | rating / 5.0 (정규화) |

```
최종 점수 = 0.4 × 적합성 + 0.3 × 개인화 + 0.2 × 유사도 + 0.1 × 평점
```

> 가중치는 MVP 초안. Phase 2 구현 후 프롬프트 평가(P1-30)에서 튜닝.
> 가중치는 `shared/constants/beauty.ts`에 상수로 정의 (G-10).

### VP-1: is_highlighted 처리

```typescript
// is_highlighted는 점수에 반영하지 않는다
// 결과에 플래그만 추가하여 UI에서 배지 표시
result.is_highlighted = entity.is_highlighted;
result.highlight_badge = entity.highlight_badge;
// 순위는 score로만 결정
```

### VP-3: null-safe (가중치 재분배)

프로필 정보가 없으면 해당 점수를 0으로 처리하되, **가용한 점수 항목에 가중치를 재분배**한다. 이렇게 해야 프로필 없는 사용자(Path B)도 의미 있는 랭킹을 받는다.

```typescript
// 가용 가중치 수집
const components = [];
if (profile.skin_type) components.push({ weight: 0.4, score: fitnessScore });
if (preferences.length > 0) components.push({ weight: 0.3, score: personalizationScore });
if (similarity != null) components.push({ weight: 0.2, score: similarity });
components.push({ weight: 0.1, score: ratingScore }); // 항상 가용

// 가중치 정규화 (합계 = 1.0)
const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
const finalScore = components.reduce((sum, c) => sum + (c.weight / totalWeight) * c.score, 0);
```

**예시:**
- 프로필 있음: `0.4×적합 + 0.3×개인화 + 0.2×유사도 + 0.1×평점`
- 프로필 없음 + 벡터: `0.67×유사도 + 0.33×평점` (가용 가중치 재분배)
- 프로필 없음 + SQL만: `1.0×평점` (평점만 가용)

## 6.2 관리자 목록 — 사용자 정렬 (경로 3)

관리자가 `sort` 파라미터로 직접 정렬 기준 선택.

### 정렬 허용 필드 (엔티티별)

| 엔티티 | 허용 필드 | 기본값 |
|--------|----------|--------|
| products | `created_at`, `updated_at`, `rating`, `price`, `review_count` | `created_at DESC` |
| treatments | `created_at`, `updated_at`, `rating`, `price_min`, `duration_minutes`, `downtime_days` | `created_at DESC` |
| stores | `created_at`, `updated_at`, `rating`, `district` | `created_at DESC` |
| clinics | `created_at`, `updated_at`, `rating`, `district` | `created_at DESC` |
| brands | `created_at`, `updated_at` | `created_at DESC` |
| ingredients | `created_at`, `updated_at` | `created_at DESC` |
| doctors | `created_at`, `updated_at` | `created_at DESC` |

> 허용되지 않은 필드로 정렬 시도 → 기본값 적용 + 400 에러 아님 (무시). SQL injection 방지.

---

# 부록

## A. 비즈니스 변경 시 영향 범위

| 변경 | 수정 파일 | core/ 영향 |
|------|----------|-----------|
| 새 필터 추가 (예: `hair_types`) | query-utils.ts + repository | ❌ |
| 다운타임 규칙 변경 (50% → 30%) | beauty/treatment.ts | ❌ |
| 랭킹 가중치 조정 | shared/constants/beauty.ts | ❌ |
| 새 도메인 추가 (DOM-3 salon) | repository 1개 + beauty/ 1개 + query-utils에 필터 | ❌ |
| 임베딩 모델 교체 | core/config.ts (환경변수만) | 코드 변경 ❌ |
| VP-1 규칙 변경 | beauty/judgment.ts | ❌ |

## B. 검색 결과 → 카드 변환

```
repository 결과 (Entity)
  → beauty.rank() → RankedEntity (score, reasons, warnings)
    → search-handler → CardData (카드 UI용 JSON)
      → LLM → 자연어 + 카드 포함 응답
```

> CardData 형식은 P1-27 (카드 생성 프롬프트)에서 정의.
