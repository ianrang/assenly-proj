# P2-61: Stores 200+ 데이터 수집 계획서

## Context

Phase A 두 번째 데이터 수집. 카카오 로컬 API(S1)로 서울 K-뷰티 매장 200건+ 수집.
P2-60(brands 73 + ingredients 105) 패턴과 동일한 4-stage 파이프라인.

---

## Step 1: 코드 수정 (4개 파일 수정 + 1개 신규)

### 1-A. `shared/constants/domains.ts` — STORE_TYPES에 "daiso" 추가

```typescript
export const STORE_TYPES = [
  "olive_young",
  "chicor",
  "daiso",           // ← 추가
  "department_store",
  "brand_store",
  "pharmacy",
  "other",
] as const;
```

**영향 분석**: 이 배열을 참조하는 모든 코드는 자동 반영됨.
- `shared/validation/store.ts`: `z.enum(STORE_TYPES)` — 자동
- `scripts/seed/lib/entity-schemas.ts`: storeCreateSchema import — 자동
- `server/features/repositories/store-repository.ts`: generic string 필터 — 무관
- DB: TEXT 컬럼, CHECK 미사용 — 마이그레이션 불필요

### 1-B. 신규: `scripts/seed/lib/store-type-classifier.ts`

**목적**: store_type 자동 분류. 인터페이스 추상화 + MVP 정규식 구현.

```typescript
// ── 인터페이스 (LLM 확장점) ──
export interface StoreTypeClassifier {
  classify(data: Record<string, unknown>): string;
}

// ── MVP: 정규식 다중 매핑 ──
interface ClassifierRule {
  type: string;
  patterns: RegExp[];
}

const CLASSIFIER_RULES: ClassifierRule[] = [
  { type: "olive_young", patterns: [/올리브영/i, /olive\s*young/i] },
  { type: "daiso", patterns: [/다이소/i, /daiso/i] },
  { type: "chicor", patterns: [/시코르/i, /chicor/i] },
  { type: "department_store", patterns: [
    /백화점/i, /갤러리아/i, /현대백화점/i, /롯데백화점/i, /신세계백화점/i,
    /더현대/i, /롯데월드몰/i, /아이파크몰/i, /department/i,
  ]},
  { type: "brand_store", patterns: [
    /이니스프리/i, /innisfree/i, /라네즈/i, /laneige/i,
    /에뛰드/i, /etude/i, /미샤/i, /missha/i,
    /토니모리/i, /tony\s*moly/i, /더페이스샵/i, /the\s*face\s*shop/i,
    /스타일난다/i, /stylenanda/i, /3ce/i,
    /설화수/i, /sulwhasoo/i, /헤라/i, /hera/i,
    /탬버린즈/i, /tamburins/i, /논픽션/i, /nonfiction/i,
    /닥터자르트/i, /dr\.?\s*jart/i, /아모레/i, /amore/i,
    /플래그십/i, /flagship/i,
  ]},
  { type: "pharmacy", patterns: [/약국/i, /pharmacy/i, /drugstore/i] },
];
// 미매칭 → "other" (폴백)

export class RegexStoreTypeClassifier implements StoreTypeClassifier {
  classify(data: Record<string, unknown>): string { ... }
}

export const defaultStoreTypeClassifier: StoreTypeClassifier =
  new RegexStoreTypeClassifier();
```

**규칙 준수**:
- P-9: scripts/ 내부. server/client import 없음
- P-10: 삭제 시 enrich-service.ts에만 영향 (scripts/ 내부)
- G-9: `StoreTypeClassifier` + `defaultStoreTypeClassifier`만 export
- G-10: 매직 문자열 없음 — `CLASSIFIER_RULES` 상수
- G-11: 인터페이스로 LLM 확장 가능
- N-2: kebab-case 파일명
- L-14: 파이프라인 전용 타입은 scripts/에 정의

### 1-C. `scripts/seed/lib/enrich-service.ts` — FIELD_MAPPINGS에 store 추가

```typescript
import { defaultStoreTypeClassifier } from "./store-type-classifier";

const FIELD_MAPPINGS: Partial<Record<EntityType, Record<string, FieldExtractor>>> = {
  ingredient: { inci_name: (data) => { ... } },
  store: {
    store_type: (data) => defaultStoreTypeClassifier.classify(data),
    district: (data) => extractDistrictFromAddress(data),
  },
};
```

**district 추출 함수** (enrich-service.ts 내부 헬퍼):

```typescript
// 한국 주소 → 구 추출 → 영문 변환
const DISTRICT_MAP: Record<string, string> = {
  "강남구": "gangnam", "서초구": "gangnam",
  "중구": "myeongdong", "종로구": "jongno",
  "마포구": "hongdae", "용산구": "itaewon",
  "송파구": "jamsil", "성동구": "seongsu",
  "영등포구": "yeouido", "동대문구": "dongdaemun",
  "강동구": "gangdong", "강서구": "gangseo",
  // 서울 25개 구 전체 매핑
};

function extractDistrictFromAddress(data: Record<string, unknown>): string | null {
  const address = data.address as Record<string, string> | undefined;
  const koAddr = address?.ko ?? "";
  const match = koAddr.match(/([가-힣]+구)\s/);
  if (!match) return null;
  return DISTRICT_MAP[match[1]] ?? match[1];
}
```

**영향 분석**:
- `applyFieldMapping()` 기존 로직 그대로 사용 — store 항목만 추가
- 기존 ingredient 매핑 변경 없음
- 추가 import: `./store-type-classifier` 1개만 (scripts/ 내부)

### 1-D. `scripts/seed/lib/review-exporter.ts` — store 검수 컬럼 보강

```typescript
store: [
  { header: "store_type", source: "data", path: "store_type", format: "string", editable: true },
  { header: "district", source: "data", path: "district", format: "string", editable: true },
  { header: "address_ko", source: "data", path: "address.ko", format: "string", editable: false },
  { header: "phone", source: "data", path: "phone", format: "string", editable: false },
  { header: "english_support", source: "data", path: "english_support", format: "string", editable: true },
  { header: "tourist_services", source: "data", path: "tourist_services", format: "array", editable: true },
  { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
  { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
],
```

**변경점**: 기존 description_ko/en 2컬럼 → 8컬럼으로 확장. P-7(단일 변경점) 준수.

### 1-E. 테스트

| 파일 | 테스트 내용 |
|------|-----------|
| `store-type-classifier.test.ts` (신규) | 정규식 매칭 7타입 + 미매칭→other + 복수 패턴 + 인터페이스 계약 |
| `enrich-service.test.ts` (수정) | store FIELD_MAPPINGS: store_type + district 매핑 검증 |
| `review-exporter.test.ts` (수정) | store 컬럼 8개 출력 검증 |

---

## Step 2: 코드 수정 + 데이터 수집 + 적재

### 2-A. fetch.ts에 `--place-queries=<file>` 지원 추가

**목적**: 카카오 검색 쿼리를 외부 JSON 파일로 전달. 코드 수정 없이 쿼리 변경 가능.

**수정**: fetch.ts 1파일, ~5줄 추가

```typescript
// 추가: readFileSync import (기존 writeFileSync 옆)
import { readFileSync, writeFileSync } from "node:fs";

// 추가: --place-queries 파일 읽기
if (args["place-queries"]) {
  const queries = JSON.parse(readFileSync(args["place-queries"], "utf-8"));
  options.placeQueries = queries;
}
```

**규칙 검증**:
- P-7: fetch.ts 1파일 수정 ✅
- P-9: server/ import 없음 ✅
- G-2: 기존 CLI 재사용 (새 스크립트 생성 불필요) ✅
- G-4: --place-queries 즉시 사용 + P2-62 재사용 ✅
- G-5: parseArgs --key=value 기존 패턴 ✅

### 2-B. 검색 쿼리 설정 파일

**신규**: `scripts/seed/data/store-queries.json`

```json
[
  { "query": "올리브영 서울" },
  { "query": "시코르 서울" },
  { "query": "다이소 화장품 서울" },
  { "query": "화장품 매장 서울" },
  { "query": "뷰티 편집숍 서울" },
  { "query": "백화점 화장품 서울" },
  { "query": "약국 화장품 서울" },
  { "query": "화장품 명동", "options": { "lat": 37.5636, "lng": 126.9869, "radius": 3000 } },
  { "query": "화장품 강남", "options": { "lat": 37.4979, "lng": 127.0276, "radius": 3000 } },
  { "query": "화장품 홍대", "options": { "lat": 37.5563, "lng": 126.9236, "radius": 3000 } }
]
```

### 2-C. 파이프라인 실행

**데이터 흐름** (기존 --entity-types 동적 필터링 활용):

```
① fetch.ts --targets=places --place-queries=store-queries.json
     → places-raw.json (stores + clinics 혼합)

② enrich.ts --input=places-raw.json --entity-types=store
     → stores-enriched.json (store만 필터링 + AI 보강)

③ export-review.ts --input=stores-enriched.json
     → review CSV (14컬럼)

④ 검수 CSV 확인/수정

⑤ import-review.ts --enriched=<json> --reviewed=<csv>
     → stores-validated.json

⑥ load.ts --input=stores-validated.json
     → DB UPSERT
```

**P2-62 재사용**: 같은 places-raw.json에서 `--entity-types=clinic`으로 시작.

---

## 변경 파일 목록 (Step 1 + Step 2 통합)

### 신규 생성
| 파일 | 목적 |
|------|------|
| `scripts/seed/lib/store-type-classifier.ts` | StoreTypeClassifier 인터페이스 + RegexStoreTypeClassifier |
| `scripts/seed/lib/store-type-classifier.test.ts` | 분류기 테스트 20개 |
| `scripts/seed/data/store-queries.json` | 카카오 검색 쿼리 설정 파일 |

### 기존 파일 수정
| 파일 | 변경 |
|------|------|
| `src/shared/constants/domains.ts` | STORE_TYPES에 "daiso" 추가 (1줄) |
| `scripts/seed/fetch.ts` | readFileSync import + --place-queries 파일 읽기 (~5줄) |
| `scripts/seed/lib/enrich-service.ts` | FIELD_MAPPINGS.store + district 헬퍼 + import |
| `scripts/seed/lib/enrich-service.test.ts` | store enrichment 테스트 2개 추가 |
| `scripts/seed/lib/review-exporter.ts` | ENTITY_REVIEW_COLUMNS.store 8컬럼 확장 |
| `scripts/seed/lib/review-exporter.test.ts` | store 8컬럼 출력 테스트 1개 추가 |

### 데이터 파일 (파이프라인 실행 시 생성)
| 파일 | 내용 |
|------|------|
| `scripts/seed/data/places-raw.json` | 카카오 fetch (stores+clinics 혼합) |
| `scripts/seed/data/stores-enriched.json` | AI 보강 완료 (store만) |
| `scripts/seed/data/stores-validated.json` | 검수 완료 |

### 수정하지 않는 파일
- `server/` 전체: 수정 없음 (P-2, R-1)
- `client/` 전체: 수정 없음 (R-2)
- `shared/validation/store.ts`: STORE_TYPES import 자동 반영
- `scripts/seed/lib/entity-schemas.ts`, `loader.ts`, `place-mapper.ts`: 수정 불필요
- `scripts/seed/enrich.ts`, `export-review.ts`, `import-review.ts`, `load.ts`: 기존 --entity-types 활용, 수정 불필요

---

## 의존성 방향 검증

```
shared/constants/domains.ts (STORE_TYPES)
  ↓ (import)
shared/validation/store.ts (zod enum)
  ↓ (import)
scripts/seed/lib/entity-schemas.ts
  ↓ (import)
scripts/seed/lib/loader.ts

scripts/seed/lib/store-type-classifier.ts (신규, 독립)
  ↓ (import)
scripts/seed/lib/enrich-service.ts
```

- 역방향 import 없음 ✅
- 순환 참조 없음 ✅
- server/ → scripts/ 참조 없음 ✅
- client/ → scripts/ 참조 없음 ✅
- scripts/ → server/ 참조 없음 (shared/만 참조) ✅

---

## 규칙 준수 체크리스트

- [x] P-1: 4계층 DAG. scripts/ → shared/ 단방향
- [x] P-2: core/ 수정 없음
- [x] P-7: store_type 추가 = constants 1파일. 분류기 추가 = 신규 1파일 + enrich-service 1곳
- [x] P-8: 순환 의존 없음
- [x] P-9: scripts/ → shared/ 허용. server/ import 없음
- [x] P-10: store-type-classifier.ts 삭제 시 enrich-service.ts만 영향 (scripts/ 내부)
- [x] G-1: 기존 코드 분석 완료 (place-mapper, enrich-service, review-exporter)
- [x] G-2: 중복 없음 (classifyPlace=store/clinic 분류, StoreTypeClassifier=store_type 분류 — 다른 책임)
- [x] G-5: P2-60 FIELD_MAPPINGS 패턴 동일하게 따름
- [x] G-8: any 없음 — Record<string, unknown> + 타입 가드
- [x] G-9: export 최소화 — 인터페이스 + 기본 인스턴스만
- [x] G-10: 매직넘버 없음 — CLASSIFIER_RULES, DISTRICT_MAP 상수
- [x] G-11: 인터페이스로 LLM 확장 가능
- [x] L-14: 파이프라인 전용 타입은 scripts/에 정의
- [x] N-2: kebab-case 파일명
- [x] Q-14: storeCreateSchema의 store_type=z.enum(STORE_TYPES) — 상수 추가로 자동 정합
- [x] V-17: 신규 모듈 삭제 시 core/features/client에 빌드 에러 없음
- [x] V-18: scripts/ → shared/ 만 import. 역방향 없음
