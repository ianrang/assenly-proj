# P2-56o2: review-exporter (Stage 3 검수 CSV)

## Context

Stage 2(enrich-service) 출력 EnrichedRecord[]를 사람이 검수할 수 있는 CSV로 export하고, 검수 완료 CSV를 import하여 ValidatedRecord[]로 변환하는 Stage 3 브릿지 모듈.

**선행 완료**: P2-56o (enrich-service ✅), P2-56j (csv-parser ✅), P2-56c (types.ts ✅)

---

## 설계 결정

### D-1. 2-파일 전략 — JSON(보존) + CSV(검수)

EnrichedRecord.data에는 CSV로 표현 불가능한 복잡 구조가 포함됨:
- LocalizedText `{ ko, en, ja, zh, es, fr }` — 6언어 중첩 객체
- `purchase_links: [{ platform, url, affiliate_code }]` — 객체 배열
- `_cosing: { inciName, function, restriction }` — 중첩 객체

CSV round-trip 시 타입 손실(number→string, null→"", 중첩 객체 파괴) 발생.

**결정**: Export 시 2파일 생성:
- **JSON 파일**: EnrichedRecord[] 전체를 JSON.stringify — 타입/구조 완벽 보존
- **CSV 파일**: 검수 필요 필드만 평탄화 — 구글시트에서 열어서 검수

Import 시 JSON(원본) + CSV(수정값)를 id로 매칭하여 ValidatedRecord[] 생성.

### D-2. 엔티티타입별 개별 파일

7개 entityType마다 분류/생성 필드가 다름:

| entityType | 분류 필드 | 생성 필드 | confidence |
|-----------|---------|---------|-----------|
| product | skin_types, concerns | description, review_summary | 2개 |
| treatment | suitable_skin_types, target_concerns | description | 2개 |
| ingredient | caution_skin_types | — | 1개 |
| store | — | description | 0개 |
| clinic | — | description | 0개 |
| brand | — (번역만) | — | 0개 |
| doctor | — (번역만) | — | 0개 |

단일 CSV 시 빈 셀 과다. 설계 문서(data-collection.md §1.2)가 `enriched-products.csv`로 엔티티별 파일을 명시.

**결정**: `exportForReview()` → 엔티티타입별 JSON+CSV 쌍 생성.

### D-3. REVIEW_COLUMNS — 선언적 컬럼 설정

```typescript
interface ReviewColumnDef {
  header: string;          // CSV 컬럼 헤더
  source: "data" | "enrichments" | "meta";
  path: string;            // dot-notation 경로
  format: "string" | "number" | "boolean" | "array";
  editable: boolean;       // import 시 CSV 값으로 오버라이드 여부
}
```

공통 컬럼 (전 엔티티):
- id, source_id, name_ko, name_en (읽기 전용 참조)
- is_approved, review_notes (검수자 입력)

엔티티별 컬럼:
- product: skin_types + confidence, concerns + confidence, description_ko/en, review_summary_ko/en
- treatment: suitable_skin_types + confidence, target_concerns + confidence, description_ko/en
- ingredient: caution_skin_types + confidence
- store/clinic: description_ko/en
- brand/doctor: 공통 컬럼만 (번역 확인용)

**P-7 준수**: 컬럼 추가/변경 = REVIEW_COLUMNS 설정 1곳 수정.

### D-4. CSV 직렬화 규칙

| 타입 | Export (data → CSV) | Import (CSV → data) |
|-----|-------|-------|
| string | 그대로 | 그대로 |
| number | 문자열 변환 | parseFloat |
| boolean | "TRUE"/"FALSE" | 대소문자 무관 "true" 판정 |
| array | `"dry\|normal"` (파이프 구분) | split("\|") → 필터(빈값 제거) |
| LocalizedText.ko | `data.name.ko` 추출 | ko 값 오버라이드 |
| LocalizedText.en | `data.name.en` 추출 | en 값 오버라이드 |

파이프(`|`) 사용 이유: SKIN_TYPES/SKIN_CONCERNS 값에 파이프 미포함. 콤마는 CSV 구분자와 충돌.

### D-5. Import 오버라이드 규칙

```
1. JSON 로드 → Map<id, EnrichedRecord>
2. CSV 행별:
   a. id로 원본 EnrichedRecord 매칭
   b. editable=true 컬럼만 원본 data에 오버라이드
   c. is_approved / review_notes 설정
   d. ValidatedRecord 구성:
      { entityType, data: {...원본data, ...수정값}, isApproved, reviewNotes }
3. CSV에 없는 레코드 = 미검수 → 제외
```

**ja/zh/es/fr 처리**: 검수 CSV에는 ko/en만 포함. 다른 언어는 JSON 원본에서 그대로 유지. 검수자가 en을 크게 수정한 경우 재번역이 필요할 수 있으나, 이는 enrich 재실행으로 처리 (review-exporter 책임 아님).

### D-6. csv-parser.ts 확장

기존 csv-parser.ts에 `stringifyCsvRows` 함수 추가:
- csv-stringify/sync 라이브러리 사용
- BOM 포함 (구글시트 한글 인코딩 호환)
- P-7 준수: CSV 처리 변경점 1파일 유지
- 파일명 변경 없음 (기존 4파일 import 변경 0건)

### D-7. ExportOptions / ImportOptions / Result

```typescript
export interface ExportOptions {
  outputDir?: string;           // 기본: scripts/seed/review-data/
  entityTypes?: EntityType[];   // 특정 엔티티만 export
  timestamp?: string;           // 파일명 타임스탬프 오버라이드 (테스트용)
}

export interface ExportResult {
  files: { entityType: EntityType; jsonPath: string; csvPath: string; count: number }[];
  total: number;
  skipped: number;
}

export interface ImportOptions {
  reviewedBy?: string;          // 기본: "google-sheets". ValidatedRecord.reviewedBy에 설정
}

export interface ImportResult {
  records: ValidatedRecord[];
  total: number;                // CSV 행 수
  matched: number;              // JSON 원본 매칭 성공
  skipped: number;              // JSON에만 있고 CSV에 없음 (미검수)
  errors: PipelineError[];      // id 불일치 등
}
```

loader/fetch-service/enrich-service의 Options/Result 패턴과 동일 (G-5).

### D-9. 결과 로그

loader/fetch-service/enrich-service 패턴 동일. `docs/data-logs/review-export-{timestamp}.json`, `review-import-{timestamp}.json`.
writeFileSync로 결과 기록. 로그 실패는 결과에 영향 없음 (Q-15).

### D-8. brand/doctor 포함 여부

brand/doctor는 분류/생성 0건 → 검수 대상 AI 필드 없음.
그러나 번역 결과(name_en) 확인은 유의미할 수 있음.

**결정**: 전 엔티티 포함하되, brand/doctor는 공통 컬럼만(id, name_ko, name_en, is_approved, review_notes). entityTypes 옵션으로 스킵 가능.

---

## 의존성

```
scripts/seed/lib/
  review-exporter.ts → types.ts (EnrichedRecord, ValidatedRecord, EntityType, PipelineError, PipelineResult)
                     → csv-parser.ts (parseCsvFile, stringifyCsvRows)
                     → node:fs (writeFileSync, readFileSync, mkdirSync, existsSync)
                     → node:path (join)

  csv-parser.ts      → csv-parse/sync (기존)
                     → csv-stringify/sync (추가)

역방향: 없음. server/, client/, core/, shared/ import: 없음.
```

---

## 규칙 준수 체크리스트

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-1 (4계층 DAG) | ✅ | scripts/ 내부만 |
| P-2 (core 불변) | ✅ | core/ 수정 0건 |
| P-7 (단일 변경점) | ✅ | 컬럼 변경 = REVIEW_COLUMNS 1곳. CSV 변경 = csv-parser.ts 1곳 |
| P-8 (순환 금지) | ✅ | 단방향: review-exporter → csv-parser, types |
| P-9 (scripts/ → shared/) | ✅ | shared/ import 없음. types.ts(scripts/ 내부)만 |
| P-10 (제거 안전성) | ✅ | 삭제해도 빌드 에러 0건 |
| G-2 (중복 금지) | ✅ | csv-parser.ts 재사용. 새 CSV stringify 코드 0건 중복 |
| G-3 (패스스루 금지) | ✅ | 필드 선별 + 평탄화 + 역변환 로직 수행 |
| G-4 (미사용 금지) | ✅ | export + import 모두 CLI(P2-56q)에서 사용 예정 |
| G-5 (기존 패턴) | ✅ | Options/Result 패턴 동일 |
| G-8 (any 금지) | ✅ | Record<string, unknown> |
| G-9 (export 최소화) | ✅ | exportForReview, importReviewed, ExportOptions, ExportResult만 |
| G-10 (매직넘버) | ✅ | REVIEW_COLUMNS 상수, 파이프 구분자 상수 |
| Q-6 (함수≤40줄) | ✅ | 헬퍼 분리 |
| Q-7 (에러 불삼킴) | ✅ | 파일 누락/id 불일치 명확 에러 |
| L-14 (모듈 전용) | ✅ | ReviewColumnDef, ExportOptions = review-exporter 내부 |
| N-2 (kebab-case) | ✅ | review-exporter.ts |

---

## 변경 파일 목록

### 신규 생성 (2개)

| 파일 | 목적 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/seed/lib/review-exporter.ts` | Stage 3 export + import | ~280 |
| `scripts/seed/lib/review-exporter.test.ts` | 단위 테스트 | ~350 |

### 기존 파일 수정 (2개)

| 파일 | 변경 | 줄 수 변경 |
|------|------|-----------|
| `scripts/seed/lib/csv-parser.ts` | `stringifyCsvRows` 함수 추가 | +15 |
| `package.json` | `csv-stringify` exact version 추가 | +1 |

### 기존 파일 수정 없음

- server/, client/, core/, shared/: 수정 0건
- 기존 csv-parser.ts import 하는 4파일: 변경 0건
- enrich-service.ts, fetch-service.ts, loader.ts: 변경 0건

---

## 테스트 전략

csv-parser.ts, node:fs 전부 vi.mock.

### csv-parser.ts 확장 테스트 (3개)
1. stringifyCsvRows 기본: 객체 배열 → CSV 문자열
2. 특수 문자: 콤마/따옴표 포함 필드 이스케이프
3. 빈 배열: 헤더만 출력

### export 테스트 (8개)
1. product export: JSON + CSV 파일 생성, 내용 검증
2. 다중 엔티티: product + ingredient → 별도 파일 쌍
3. brand (분류 없음): 공통 컬럼만 CSV
4. 빈 레코드: 파일 미생성
5. array 직렬화: skin_types → 파이프 구분
6. LocalizedText 평탄화: name.ko → name_ko 컬럼
7. confidence 포함: enrichments.confidence 값 CSV에 반영
8. entityTypes 필터: product만 → 나머지 스킵

### import 테스트 (8개)
9. 기본 import: JSON + CSV → ValidatedRecord[]
10. skin_types 수정: "dry|combination" → ["dry","combination"] 오버라이드
11. description 수정: ko/en 텍스트 오버라이드
12. is_approved: TRUE/FALSE 파싱
13. review_notes: 텍스트 전달
14. 미검수 레코드: JSON에만 있고 CSV에 없음 → 제외
15. 빈 array: "" → []
16. id 불일치: CSV의 id가 JSON에 없음 → PipelineError

### 통합 테스트 (1개)
17. export → import round-trip: export한 CSV를 그대로 import → 원본 data 보존 검증

---

## 구현 순서

1. `csv-stringify` 설치
2. `csv-parser.ts` 수정 — stringifyCsvRows 추가
3. `review-exporter.ts` 구현
4. `review-exporter.test.ts` 구현
5. 전체 테스트 + tsc --noEmit
