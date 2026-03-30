# P2-56p: loader (Stage 4 DB 적재)

## Context

4-stage 파이프라인의 최종 단계. ValidatedRecord[] (Stage 3 검수 완료)를 받아 zod 재검증 → FK 순서 정렬 → 100건 청크 UPSERT → LoadResult[] 반환.

**선행 완료**: P2-56a (shared/validation/ zod 스키마 ✅), P2-2 (server/core/db.ts ✅), P2-56c (types.ts ✅), P2-56b (config.ts ✅)

---

## 설계 결정

### D-1. 파이프라인 전용 DB 클라이언트 (db-client.ts)

server/core/db.ts를 직접 import할 수 없음:
- db.ts L3: `import { env } from './config'` → config.ts L89: `envSchema.parse(process.env)` 모듈 레벨 실행
- ADMIN_JWT_SECRET, ENCRYPTION_KEY 등 15개 환경변수가 파이프라인에 없음 → parse 에러
- P-9는 `scripts/ → server/core/` 규칙상 허용하나, config.ts 부작용으로 기술적 불가

ai-client.ts와 동일 패턴으로 `scripts/seed/lib/db-client.ts` 작성:
- pipelineEnv의 DB 환경변수로 `createClient()` 직접 호출
- service_role 키 사용 (RLS 우회 — 시드 적재용)
- G-2 미위반: server/core/db.ts와 환경변수 소스가 다름 (env vs pipelineEnv)
- P-7: DB 연결 변경 시 이 파일 1곳만 수정

### D-2. Deterministic UUID (id-generator.ts)

DB 스키마 7개 엔티티 테이블 분석 결과:
- PK: `id uuid [pk, default: gen_random_uuid()]` — 자연키 UNIQUE 없음
- 파이프라인이 id 미지정 시 → 재적재마다 새 UUID → 중복 레코드 발생
- data-pipeline.md §3.4.1: "중복 키 → UPSERT (ON CONFLICT UPDATE)" 요구

uuid v5 (RFC 4122 deterministic) 채택:
- `uuid5(entityType별_namespace, "source:sourceId")` → 동일 입력 = 동일 UUID
- entityType별 고정 namespace로 다른 엔티티 간 충돌 방지
- `source:sourceId` 접두사로 다른 프로바이더 간 충돌 방지
- Q-12(멱등성): 재적재 시 중복 없음
- FK 참조: 같은 함수 + 같은 입력 → 동일 UUID → 정합성 자동 보장

UUID 생성 시점: enrich-service(P2-56o)에서 data.id에 삽입.
loader는 data.id가 이미 존재한다고 가정 → 단일 책임(validate + UPSERT).

### D-3. entityType → 스키마/테이블 매핑

```typescript
const ENTITY_CONFIG: Record<EntityType, {
  tableName: string;
  schema: z.ZodSchema;
  onConflict: string;
}> = {
  brand:      { tableName: 'brands',      schema: brandCreateSchema,      onConflict: 'id' },
  ingredient: { tableName: 'ingredients',  schema: ingredientCreateSchema, onConflict: 'id' },
  product:    { tableName: 'products',     schema: productCreateSchema,    onConflict: 'id' },
  store:      { tableName: 'stores',       schema: storeCreateSchema,      onConflict: 'id' },
  clinic:     { tableName: 'clinics',      schema: clinicCreateSchema,     onConflict: 'id' },
  treatment:  { tableName: 'treatments',   schema: treatmentCreateSchema,  onConflict: 'id' },
  doctor:     { tableName: 'doctors',      schema: doctorCreateSchema,     onConflict: 'id' },
};
```

- shared/validation/의 기존 create 스키마 재사용 (G-2 중복 금지)
- Q-14(스키마 정합성): zod 필수/선택/허용값이 DB 제약과 일치 (P2-56a에서 검증 완료)
- 확장: v0.2 salon 추가 시 매핑 1줄 추가, loader 로직 수정 0

### D-4. FK 순서 보장 — Phase A→B→C

schema.dbml FK 의존 관계에서 도출:

```typescript
const LOAD_PHASES: EntityType[][] = [
  ['brand', 'ingredient', 'store', 'clinic', 'treatment'],  // Phase A: 독립
  ['product', 'doctor'],                                       // Phase B: FK 의존
];
// Phase C: junction은 loadJunctions()로 별도 처리
```

- Phase A: FK 없는 5개 엔티티. 타입별 독립 적재
- Phase B: products → brands.id (SET NULL), doctors → clinics.id (RESTRICT)
- Phase C: junction 3개 → 복합PK ON CONFLICT
- Q-13(FK 순서): 부모 → 자식 보장

### D-5. 100건 청크 트랜잭션

data-pipeline.md §3.4.2:
> "단일 엔티티 내: 100건 단위 청크. 청크 실패 시 해당 청크만 롤백, 이전 청크는 커밋 유지."

Supabase `.upsert(배열)` = 단일 INSERT...ON CONFLICT SQL = 원자 트랜잭션:
- 청크 100건 → 1회 `.upsert()` 호출 → 전체 성공 또는 전체 실패
- 이전 청크는 별도 호출이므로 이미 커밋 유지
- Q-11(복합 쓰기 원자성) 준수

청크 진입 전 zod safeParse로 불량 레코드 필터링:
- data-pipeline.md §3.4.1: "Validate 실패 → 해당 레코드 스킵, 에러 로그"
- zod 통과한 레코드만 청크에 포함 → DB 제약 위반 최소화

### D-6. LoadOptions — 회차별 유연성

```typescript
export interface LoadOptions {
  batchSize?: number;           // 청크 크기 오버라이드 (기본: PIPELINE_BATCH_SIZE=100)
  dryRun?: boolean;             // 검증만 수행, DB 미접근
  entityTypes?: EntityType[];   // 특정 타입만 적재
  insertOnly?: boolean;         // UPSERT 대신 INSERT (최초 적재)
  logDir?: string;              // 결과 JSON 로그 경로 (기본: docs/data-logs/)
}
```

- M1: `{ insertOnly: true }`, M2: `{}` (UPSERT), M3: `{ entityTypes: ['product'] }`
- 코드 수정 없이 옵션만 변경 → P-7(단일 변경점)

### D-7. 적재 로그

seed-data-plan.md L150:
> "로그 파일(JSON)은 `docs/data-logs/` 디렉토리에 날짜별 보존하며, Git 커밋에 포함하여 영속성을 확보한다."

파일명: `load-{ISO timestamp}.json`
내용: `{ config, results: LoadResult[], summary }`

### D-8. 임베딩 미포함

- TODO.md P2-56p: "zod 검증 → DB UPSERT" — 임베딩 언급 없음
- TODO.md P2-64d: "Phase D: 임베딩 생성 + 벡터 DB 적재" — 별도 태스크
- loader는 Phase A~C(엔티티 + junction), 임베딩은 Phase D(P2-64d)

### D-9. loader 함수 시그니처 — DI 패턴

```typescript
export async function loadRecords(
  client: SupabaseClient,
  records: ValidatedRecord[],
  options?: LoadOptions,
): Promise<LoadResult[]>
```

- client: DI — profile/service.ts:39 `upsertProfile(client, ...)` 패턴과 동일
- 테스트에서 mock client 주입 가능
- CLI entry point(P2-56q)에서 `createPipelineClient()` → `loadRecords()` 호출

### D-10. Junction 적재

ValidatedRecord의 entityType은 7개 엔티티만 정의 (types.ts).
Junction 데이터는 별도 함수로 처리:

```typescript
export async function loadJunctions(
  client: SupabaseClient,
  junctions: { type: JunctionType; data: Record<string, unknown>[] }[],
  options?: LoadOptions,
): Promise<LoadResult[]>
```

- junction 스키마: shared/validation/relation.ts의 기존 스키마 사용
- ON CONFLICT: 복합PK (product_id,store_id 등)

---

## 의존성

```
scripts/seed/lib/
  id-generator.ts → uuid (npm), types.ts (EntityType)
  db-client.ts    → @supabase/supabase-js (npm), config.ts (pipelineEnv)
  loader.ts       → types.ts, config.ts, shared/validation/, id-generator 미사용(data.id 이미 존재)

역방향: 없음. server/, client/, core/ import: 없음.
```

---

## 규칙 준수 체크리스트

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-1 (4계층 DAG) | ✅ | scripts/ → shared/ 단방향 |
| P-2 (core 불변) | ✅ | core/ 수정 0건 |
| P-7 (단일 변경점) | ✅ | 변경 시나리오 모두 1~2파일 |
| P-8 (순환 의존 금지) | ✅ | 모든 import 단방향 |
| P-9 (scripts/ → shared/ 허용) | ✅ | shared/validation/, shared/types만 import |
| P-10 (제거 안전성) | ✅ | 3파일 삭제해도 빌드 에러 0 |
| Q-6 (함수 ≤40줄) | ✅ | 핵심 로직 helper 분리 |
| Q-8 (env 모듈 경유) | ✅ | pipelineEnv via config.ts |
| Q-11 (복합 쓰기 원자성) | ✅ | chunk upsert 단일 SQL |
| Q-12 (멱등성) | ✅ | deterministic UUID + UPSERT |
| Q-13 (FK 순서) | ✅ | Phase A→B→C |
| Q-14 (스키마 정합성) | ✅ | 기존 zod 스키마 재사용 |
| G-2 (중복 금지) | ✅ | shared/validation/ 재사용, 신규 스키마 0 |
| G-4 (미사용 코드 금지) | ✅ | loadRecords → P2-56q CLI에서 호출 |
| G-5 (기존 패턴) | ✅ | ai-client/translator/profile.service 패턴 |
| G-8 (any 금지) | ✅ | z.ZodSchema + Record<string, unknown> |
| G-9 (export 최소화) | ✅ | loadRecords, loadJunctions, LoadOptions만 export |
| G-10 (매직 넘버 금지) | ✅ | PIPELINE_BATCH_SIZE 상수, namespace 상수 |
| L-14 (모듈 전용 타입) | ✅ | LoadOptions는 scripts/seed/lib/ 내부 |
| N-2 (kebab-case) | ✅ | loader.ts, db-client.ts, id-generator.ts |
| S-* | N/A | UI 코드 아님 |

---

## 변경 파일 목록

### 신규 생성 (3개 + 테스트 2개)

| 파일 | 목적 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/seed/lib/db-client.ts` | 파이프라인 전용 Supabase 클라이언트 | ~25 |
| `scripts/seed/lib/id-generator.ts` | Deterministic UUID v5 생성 | ~45 |
| `scripts/seed/lib/loader.ts` | Stage 4 validate + UPSERT | ~200 |
| `scripts/seed/lib/loader.test.ts` | loader 단위 테스트 | ~300 |
| `scripts/seed/lib/id-generator.test.ts` | UUID 생성 테스트 | ~80 |

### 기존 파일 수정 (0개)

- server/core/* 수정 없음 (P-2)
- shared/* 수정 없음
- scripts/seed/lib/types.ts 수정 없음
- scripts/seed/config.ts 수정 없음

### npm 패키지 추가 (1개)

- `uuid` (정확한 버전 — Q-9)

---

## 테스트 전략

### loader.test.ts

config, db-client mock (ai-client 테스트와 동일 vi.mock 패턴):

1. **zod 검증**: 유효 레코드 통과, 무효 레코드 스킵 + PipelineError 기록
2. **FK 순서**: Phase A → B → C 순서 호출 검증
3. **청크 분할**: 250건 → 3청크(100+100+50) 분할 검증
4. **UPSERT 호출**: `.from(tableName).upsert(chunk, { onConflict })` 호출 검증
5. **청크 실패 격리**: 2번째 청크 에러 → 1번째 결과 유지, 3번째 계속 실행
6. **빈 레코드**: 빈 배열 → LoadResult 0건, 에러 없음
7. **entityTypes 필터**: options.entityTypes 지정 시 해당 타입만 적재
8. **dryRun**: DB 호출 0건, 검증 결과만 반환
9. **insertOnly**: `.insert()` 호출 검증 (`.upsert()` 아님)
10. **junction 적재**: 복합PK ON CONFLICT 검증
11. **결과 JSON 로그**: writeFileSync 호출 + 경로 검증
12. **batchSize 오버라이드**: options.batchSize=50 → 50건씩 분할

### id-generator.test.ts

1. **결정적**: 동일 입력 → 동일 UUID
2. **다른 entityType**: 같은 sourceId, 다른 namespace → 다른 UUID
3. **다른 source**: "kakao:123" vs "csv:123" → 다른 UUID
4. **UUID 형식**: RFC 4122 UUID 형식 검증
5. **모든 entityType**: 7개 타입 모두 namespace 존재 검증
6. **빈 sourceId**: 에러 또는 정의된 동작

---

## 구현 순서

1. `uuid` 패키지 설치
2. `id-generator.ts` + 테스트
3. `db-client.ts` (테스트는 loader.test.ts에서 mock으로 커버)
4. `loader.ts` + 테스트
5. 전체 테스트 실행 + tsc --noEmit
