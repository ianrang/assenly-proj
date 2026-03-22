# 임베딩 전략 — P1-38 / P1-39

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: schema.dbml v2.0, search-engine.md §4, security-infra.md §1, data-pipeline.md §3/§6, seed-data-plan.md §3.3.3
> 원칙: 기존 문서의 "구현 HOW"만 기술. core/ 수정 없음 (P-2). 정책 변경 = 1파일 (P-7).

---

## 1. 임베딩 설정 (shared/constants/embedding.ts)

### 1.1 EMBEDDING_CONFIG 상수

> 환경변수(EMBEDDING_PROVIDER, EMBEDDING_DIMENSION)는 security-infra.md §1에서 정의. 본 상수는 비즈니스 레이어 설정만.

```typescript
// shared/constants/embedding.ts — L-13: 순수 상수만, 런타임 부작용 없음

export const EMBEDDING_CONFIG = {
  /** 텍스트 구성 변경 시 증가. 구 버전 임베딩 재생성 기준. */
  VERSION: 'v1',

  /** 임베딩 텍스트에 포함할 언어 (v0.2 V2-10: ja/zh 추가 검토) */
  TEXT_LANGUAGES: ['en', 'ko'] as const,

  /** 엔티티별 임베딩 텍스트 구성 필드 (schema.dbml 컬럼명 기준) */
  TEXT_FIELDS: {
    products: ['name', 'description', 'category', 'skin_types',
               'concerns', 'key_ingredients', 'tags'] as const,
    stores: ['name', 'description', 'district', 'store_type',
             'english_support', 'tourist_services', 'tags'] as const,
    clinics: ['name', 'description', 'district', 'clinic_type',
              'english_support', 'consultation_type', 'tags'] as const,
    treatments: ['name', 'description', 'category', 'target_concerns',
                 'suitable_skin_types', 'tags'] as const,
  },

  /** 태그 필터링 (MVP: null = 전체 포함. v0.2 V2-9에서 규칙 정의 후 활성화) */
  TAG_FILTER: null as null | { include: string[]; exclude: string[] },

  /** 배치 임베딩 간격 (rate limit 대응. Google AI Studio Free: 1,500 req/min) */
  BATCH_DELAY_MS: 1000,

  /** 임베딩 텍스트 최대 길이 (토큰 효율. gemini-embedding-001 최대 ~2,048 tokens) */
  MAX_TEXT_LENGTH: 2000,
} as const;
```

### 1.2 설정과 환경변수의 관계

| 구분 | 위치 | 내용 | 변경 방법 |
|------|------|------|----------|
| **시스템 레이어** | security-infra.md §1 → `core/config.ts` | EMBEDDING_PROVIDER, EMBEDDING_DIMENSION | `.env` 변경 (코드 수정 0) |
| **비즈니스 레이어** | 본 파일 → `shared/constants/embedding.ts` | TEXT_FIELDS, TEXT_LANGUAGES, TAG_FILTER | 코드 상수 수정 (1파일) |

### 1.3 설정 변경 시나리오별 수정 파일

| 변경 | 수정 파일 | P-7 |
|------|----------|-----|
| 임베딩 모델 교체 (gemini → voyage) | `.env` (1) | ✅ |
| 차원 변경 (1024 → 768) | `.env` (1) + DB 마이그레이션 (1) + 전수 재생성 | ⚠️ |
| 텍스트 필드 추가 (예: review_summary) | `embedding.ts` (1) + `text-builder.ts` (1) | ✅ |
| 언어 추가 (ja) | `embedding.ts` (1) | ✅ |
| 태그 필터링 활성화 | `embedding.ts` (1) | ✅ |
| 새 엔티티 추가 (salon) | `embedding.ts` (1) + `text-builder.ts` (1) | ✅ |

### 1.4 포함/제외 필드 근거

> 원칙: **텍스트 의미가 있는 필드만** 포함. 숫자/boolean/URL/구조화 JSON은 SQL 필터로 처리 (search-engine.md §2.3).

**Products — 제외 필드:**

| 필드 | 타입 | 제외 이유 |
|------|------|----------|
| brand_id | uuid FK | FK만. brand.name은 v0.2 V2-11에서 JOIN 포함 검토 |
| price | int | 숫자 → SQL `price <= ?` 필터 |
| volume | text | 단위 텍스트 ("50ml") — 검색 기여 미미 |
| rating, review_count | float/int | 숫자 → SQL 정렬/필터 |
| review_summary | jsonb | v0.2 AI 생성 후 추가 검토 |
| images | text[] | CDN URL — 의미 없음 |
| purchase_links | jsonb | URL — 의미 없음 |
| english_label, tourist_popular | boolean | SQL 필터로 처리 |
| is_highlighted, highlight_badge | boolean/jsonb | VP-1: 배지 표시만, 검색 미영향 |

**Stores/Clinics — 제외 필드:**

| 필드 | 제외 이유 |
|------|----------|
| location | geography 좌표 → GiST 인덱스 (v0.2) |
| address | 구조화 LocalizedText → SQL/위치 검색으로 처리 |
| operating_hours | 복합 JSON → SQL 시간 필터 (v0.2) |
| external_links | URL 배열 |
| nearby_landmarks | 참고용 텍스트 — 검색 기여 미미 |
| payment_methods | 필터용 배열 |

**Treatments — 제외 필드:**

| 필드 | 제외 이유 |
|------|----------|
| price_min, price_max, price_currency | 숫자 → SQL `price_max <= ?` |
| duration_minutes, downtime_days | 숫자 → SQL 필터 + beauty/treatment.ts 계산 |
| session_count | 표시용 텍스트 ("3~5회") — 검색 기여 미미 |
| precautions, aftercare | 별도 KB 문서로 관리 (seed-data-plan.md §3.3) |

---

## 2. 임베딩 대상 텍스트 (P1-38)

### 2.1 코드 배치

```
server/features/embedding/
├── text-builder.ts    # 엔티티 → 텍스트 조합 (순수 함수)
└── generator.ts       # 텍스트 → 벡터 → DB 저장
```

> text-builder.ts는 features/에 배치 (K-뷰티 필드명 참조 → L-5: core/ 부적합).
> 순수 함수 (DB/API 호출 없음) — 입력: Entity 객체, 출력: string.

### 2.2 텍스트 빌더 함수

```typescript
// server/features/embedding/text-builder.ts
import 'server-only';
import { EMBEDDING_CONFIG } from '@/shared/constants/embedding';
import type { Product, Store, Clinic, Treatment } from '@/shared/types/domain';

function getLocalizedText(field: Record<string, string> | null): string {
  if (!field) return '';
  return EMBEDDING_CONFIG.TEXT_LANGUAGES
    .map(lang => field[lang] || '')
    .filter(Boolean)
    .join('. ');
}

function getTagsText(tags: string[] | null): string {
  if (!tags?.length) return '';
  const filter = EMBEDDING_CONFIG.TAG_FILTER;
  if (!filter) return tags.join(', ');              // MVP: 전체 포함
  return tags.filter(t => !filter.exclude.includes(t)).join(', ');  // v0.2
}

export function buildProductEmbeddingText(product: Product): string {
  const parts = [
    getLocalizedText(product.name),
    getLocalizedText(product.description),
    product.category,
    product.skin_types?.join(', '),
    product.concerns?.join(', '),
    Array.isArray(product.key_ingredients)
      ? product.key_ingredients.join(', ')
      : '',
    getTagsText(product.tags),
  ];
  return parts.filter(Boolean).join(' | ').slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

export function buildStoreEmbeddingText(store: Store): string {
  const parts = [
    getLocalizedText(store.name),
    getLocalizedText(store.description),
    store.district,
    store.store_type,
    store.english_support,
    store.tourist_services?.join(', '),
    getTagsText(store.tags),
  ];
  return parts.filter(Boolean).join(' | ').slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

export function buildClinicEmbeddingText(clinic: Clinic): string {
  const parts = [
    getLocalizedText(clinic.name),
    getLocalizedText(clinic.description),
    clinic.district,
    clinic.clinic_type,
    clinic.english_support,
    clinic.consultation_type?.join(', '),
    getTagsText(clinic.tags),
  ];
  return parts.filter(Boolean).join(' | ').slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

export function buildTreatmentEmbeddingText(treatment: Treatment): string {
  const parts = [
    getLocalizedText(treatment.name),
    getLocalizedText(treatment.description),
    treatment.category,
    treatment.target_concerns?.join(', '),
    treatment.suitable_skin_types?.join(', '),
    getTagsText(treatment.tags),
  ];
  return parts.filter(Boolean).join(' | ').slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}
```

### 2.3 다국어 전략

> 사용자 쿼리 정규화는 본 문서 범위 외 (P1-31 Tool 설계에서 처리).

| 항목 | 설계 |
|------|------|
| 임베딩 텍스트 언어 | en + ko (EMBEDDING_CONFIG.TEXT_LANGUAGES) |
| 사용자 쿼리 | LLM이 tool 파라미터에 영어로 정규화 (시스템 프롬프트 지시) |
| cross-lingual 안전망 | gemini-embedding-001: 100+ 언어 네이티브 지원 |
| v0.2 확장 | ja/zh 사용자 비율 >20% 시 TEXT_LANGUAGES 확장 (V2-10) |

### 2.4 KB 문서 임베딩

> KB 문서 구조/품질 기준: seed-data-plan.md §3.3 참조. 본 섹션은 임베딩 방법만.

| 항목 | 설계 |
|------|------|
| 청크 단위 | 1 Markdown 파일 = 1 청크 (seed-data-plan.md §3.3.3) |
| 텍스트 | 파일 전체 내용 (200~2000자 가이드: seed-data-plan.md G6) |
| 임베딩 함수 | `core/knowledge.ts: embedDocument(text)` (search-engine.md §4.2) |
| 벡터 공간 | 엔티티 임베딩과 동일 모델/차원 (1024d) |
| 저장 | 별도 KB 테이블 (v0.2. MVP는 시스템 프롬프트 인라인 또는 파일 기반) |

---

## 3. 임베딩 생성 파이프라인 (P1-39)

### 3.1 코드 배치 + 의존성

```
server/features/embedding/generator.ts
  ├──→ text-builder.ts (같은 폴더)
  ├──→ core/knowledge.ts: embedDocument() (search-engine.md §4.2)
  └──→ repositories/*: updateEmbedding() (아래 §3.2)

의존 방향: features/embedding → core/, shared/ (단방향, R-3 준수)
core/knowledge.ts → (외부 라이브러리만, features/ import 없음)
```

### 3.2 Repository 임베딩 업데이트 메서드

각 entity-repository.ts에 추가할 메서드:

```typescript
// server/features/repositories/product-repository.ts (R-8: DB CRUD만)
async function updateEmbedding(
  client: SupabaseClient,
  id: string,
  embedding: number[]
): Promise<void> {
  const { error } = await client
    .from('products')
    .update({ embedding })
    .eq('id', id);
  if (error) throw error;
}
```

> 동일 패턴을 store-repository, clinic-repository, treatment-repository에 적용.

### 3.3 Generator 함수

```typescript
// server/features/embedding/generator.ts
import 'server-only';
import { embedDocument } from '@/server/core/knowledge';
import { EMBEDDING_CONFIG } from '@/shared/constants/embedding';
import {
  buildProductEmbeddingText,
  buildStoreEmbeddingText,
  buildClinicEmbeddingText,
  buildTreatmentEmbeddingText,
} from './text-builder';

type EntityType = keyof typeof EMBEDDING_CONFIG.TEXT_FIELDS;

const TEXT_BUILDERS: Record<EntityType, (entity: unknown) => string> = {
  products: buildProductEmbeddingText,
  stores: buildStoreEmbeddingText,
  clinics: buildClinicEmbeddingText,
  treatments: buildTreatmentEmbeddingText,
};

/** 단일 엔티티 임베딩 재생성 (비동기 호출용) */
export async function regenerateEmbedding(
  client: SupabaseClient,
  entityType: EntityType,
  entityId: string,
  entity: Record<string, unknown>
): Promise<void> {
  const textBuilder = TEXT_BUILDERS[entityType];
  if (!textBuilder) throw new Error(`Unknown entity type for embedding: ${entityType}`);
  const text = textBuilder(entity);
  const embedding = await embedDocument(text);

  const { error } = await client
    .from(entityType)
    .update({ embedding })
    .eq('id', entityId);

  if (error) throw error;
}

/** 배치 임베딩 생성 (초기 적재/전수 재생성용) */
export async function batchGenerateEmbeddings(
  client: SupabaseClient,
  entityType: EntityType
): Promise<{ success: number; failed: number }> {
  const { data: entities, error } = await client
    .from(entityType)
    .select('*')
    .eq('status', 'active');

  if (error) throw error;
  if (!entities) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      await regenerateEmbedding(client, entityType, entity.id, entity);
      success++;
    } catch (err) {
      console.error('[EMBEDDING_BATCH_FAILED]', {
        entityType, entityId: entity.id, error: (err as Error).message,
      });
      failed++;
    }
    // rate limit 대응
    await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.BATCH_DELAY_MS));
  }

  return { success, failed };
}
```

### 3.4 관리자 CRUD 연동 — 변경 감지 + 비동기 재생성

> 패턴: 관리자 CRUD 후 비동기 side-effect (감사 로그와 동일 구조).

```typescript
// server/features/admin/service.ts (또는 각 entity service)

/** 필드별 깊은 비교 (JSONB 키 순서, 배열 순서 안전) */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>).sort();
    const keysB = Object.keys(b as Record<string, unknown>).sort();
    return keysA.length === keysB.length
      && keysA.every((k, i) => k === keysB[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** 임베딩 텍스트 필드 변경 여부 판단 */
function shouldRegenerateEmbedding(
  entityType: EntityType,
  oldEntity: Record<string, unknown>,
  newEntity: Record<string, unknown>
): boolean {
  if (!(entityType in EMBEDDING_CONFIG.TEXT_FIELDS)) {
    // 임베딩 미지원 엔티티 (brands, ingredients, doctors 등)
    return false;
  }
  const fields = EMBEDDING_CONFIG.TEXT_FIELDS[entityType];
  return fields.some(field => !deepEqual(oldEntity[field], newEntity[field]));
}

// 관리자 PUT 패턴 (api-spec §5.1 + auth-matrix.md §3.3 참조)
async function updateEntity(client, entityType, id, body) {
  const oldEntity = await repository.findById(client, id);
  const newEntity = await repository.update(client, id, body);

  // 감사 로그 (기존 패턴)
  await auditLogService.record(client, admin.id, `${entityType}.update`, id, { before: oldEntity, after: newEntity });

  // 임베딩 재생성 (비동기 fire-and-forget)
  if (shouldRegenerateEmbedding(entityType, oldEntity, newEntity)) {
    regenerateEmbedding(createServiceClient(), entityType, id, newEntity)
      .catch(err => {
        // Q-7: 에러 불삼킴 — 로깅
        console.error('[EMBEDDING_REGEN_FAILED]', {
          entityType, entityId: id, error: err.message,
        });
        // embedding = null 잔류. SQL 검색 정상. 관리자 재저장으로 재시도.
      });
  }

  return newEntity;
}
```

### 3.5 초기 적재 연동

> data-pipeline.md §3 ETL 완료 후 실행. 별도 스크립트.

```typescript
// scripts/generate-embeddings.ts
import { batchGenerateEmbeddings } from '@/server/features/embedding/generator';

const entityTypes = ['products', 'stores', 'clinics', 'treatments'] as const;

for (const type of entityTypes) {
  console.log(`Generating embeddings for ${type}...`);
  const result = await batchGenerateEmbeddings(client, type);
  console.log(`  ${type}: ${result.success} success, ${result.failed} failed`);
}
```

### 3.6 Null embedding 안전성

| 상황 | embedding 상태 | 벡터 검색 | SQL 검색 |
|------|---------------|----------|----------|
| 생성 직후 (~1초) | null | ❌ 제외 | ✅ 정상 |
| 비동기 완료 후 | vector(1024) | ✅ 포함 | ✅ 정상 |
| API 실패 | null (잔류) | ❌ 제외 | ✅ 정상 |
| inactive 엔티티 | 무관 | ❌ (status 필터) | ❌ (status 필터) |

> **null 안전성 근거**: search-engine.md §5.2의 호출 분기에서 벡터 검색 시 `WHERE embedding IS NOT NULL` 조건 적용 (RPC 함수 내부 또는 호출 측).
> SQL 검색(findByFilters)은 embedding 컬럼을 참조하지 않음 → null 영향 없음.

### 3.7 동시성 처리

- MVP: **last-write-wins** (관리자 동시 수정 빈도 극히 낮음)
- 동일 엔티티에 두 비동기 재생성이 경합 시 → 마지막 완료된 벡터가 저장
- 양쪽 모두 **최신 entity 데이터 기반**이므로 결과 동일 (generator가 entity를 파라미터로 받음)
- v0.2: optimistic lock 검토 (`embedding_version` 컬럼 또는 `updated_at` 비교)

---

## 4. v0.2+ 로드맵

| ID | 항목 | 트리거 조건 |
|----|------|-----------|
| V2-9 | 태그 필터링 활성화 | 관리자 태그 관리 규칙 정의 후 |
| V2-10 | 다국어 임베딩 텍스트 확장 (ja/zh) | 해당 언어 사용자 비율 >20% |
| V2-11 | 교차 엔티티 CASCADE 재생성 | Brand/Ingredient 변경 → 관련 Product 재생성 |
| - | 벡터 인덱스 (HNSW) | 데이터 1,000건+ (index-strategy.md §7) |
| - | 임베딩 모델 교체 | 품질/비용 재평가 시. 전수 재생성 필요 |
| - | VERSION 증가 + 마이그레이션 | TEXT_FIELDS 변경 시. 구 버전 감지 → 재생성 |

---

## 5. 검증 체크리스트

```
[x] D-1: schema.dbml 필드명 원문 대조 — 4엔티티 25+ 필드 전수 확인
[x] D-4: TEXT_FIELDS의 모든 컬럼이 schema.dbml에 존재
[x] D-5: admin CRUD → shouldRegenerate → 비동기 generator → embedDocument → DB UPDATE end-to-end
[x] L-5: core/knowledge.ts에 K-뷰티 용어 없음 (텍스트와 벡터만)
[x] L-13: shared/constants/embedding.ts = 순수 상수만 (런타임 부작용 없음)
[x] P-2: core/ 수정 없음 (새 엔티티 추가해도 knowledge.ts 불변)
[x] P-3: features/embedding/ 제거 시 다른 features 무영향 (벡터 검색만 비활성)
[x] P-5: admin route → service → generator → knowledge.ts/repository = 4단계
[x] P-7: 정책 변경 = embedding.ts 1파일 (언어/태그/필드). 코드 변경 최대 2파일
[x] G-10: BATCH_DELAY_MS, MAX_TEXT_LENGTH 상수화
[x] Q-7: 비동기 실패 시 console.error 로깅 (embedding = null, 비즈니스 미차단)
[x] R-3: core/ → features/ import 없음
[x] R-8: repository = DB CRUD만 (updateEmbedding은 UPDATE 1건)
```
