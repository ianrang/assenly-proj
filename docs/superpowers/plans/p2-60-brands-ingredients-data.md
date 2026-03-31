# P2-60: Phase A — Brands 50+ / Ingredients 100+ 데이터 수집

## Context

파이프라인 코드(P2-56 전체) 완료 후, 실 데이터를 수집하여 DB에 적재하는 첫 번째 Phase A 작업.
M2 AI 통합 테스트 기반 구축이 목적.

**선행 완료**: P2-56 파이프라인 전체 ✅, P2-V2 식약처 API 검증 ✅, P2-V4 CosIng 검증 ✅, P2-59 큐레이션 ✅

---

## Step 1: 코드 보완 (3파일 수정 + 테스트)

### 발견된 문제 2건

| ID | 문제 | 원인 | 영향 |
|----|------|------|------|
| F-1 | `inci_name` DB 적재 시 null | S3의 `INGR_ENG_NAME`이 zod strip으로 소실 | ingredients.inci_name 항상 null |
| F-2 | `function[]` DB 적재 시 빈 배열 | CosIng Function이 분류 대상이 아님 | ingredients.function 항상 [] |

### 1-A. classifier.ts — FieldSpec strict 옵션 추가

**변경 이유**: function[]은 자유 텍스트 배열(schema.dbml CHECK 없음, M1 스켈레톤 23개 고유값). 기존 classifier의 allowedValues 하드필터링은 닫힌 열거값(skin_types 5개, concerns 11개) 전용. 자유 텍스트에 적용하면 AI가 올바르게 분류해도 목록에 없는 값이 필터링되어 누락.

**변경 내용**:

```typescript
// FieldSpec 인터페이스 확장
export interface FieldSpec {
  fieldName: string;
  allowedValues: readonly string[];
  promptHint: string;
  /** true(기본): allowedValues 외 값 필터링. false: 예시로만 사용 */
  strict?: boolean;
}
```

프롬프트 분기 (buildClassificationPrompt):
- `strict !== false` → 기존: `"Allowed values: ..."` + `"Select ONLY from the allowed values"`
- `strict === false` → `"Example values: ..."` + `"Use these as examples but you may include other relevant terms"`

필터 분기 (parseClassificationResponse):
- `strict !== false` → 기존: `allowedSet.has(v)` 필터
- `strict === false` → `typeof v === "string" && v.trim().length > 0` (빈 문자열만 제거)

**하위 호환**: strict 미지정 → undefined → `strict !== false`는 true → 기존 동작 100% 유지. 기존 테스트 변경 0건.

**규칙 검증**:
- P-7: classifier.ts 1파일만 수정
- P-10: strict 필드 제거해도 기본값 true → 기존 동작 유지
- G-5: FieldSpec 인터페이스 확장 패턴 (기존 optional 필드 추가와 동일)
- G-8: `strict?: boolean` 타입 명확
- G-11: strict:false로 AI 자유도 확보 → 새 자유 텍스트 필드에 재사용 가능

### 1-B. enrich-service.ts — function spec + inci_name 매핑

**변경 1: INGREDIENT_FUNCTIONS 로컬 상수**

M1 스켈레톤 10건(23개 고유값) + KB 문서에서 도출:

```typescript
const INGREDIENT_FUNCTIONS = [
  "moisturizing", "hydration", "moisture retention",
  "anti-aging", "anti-wrinkle", "wrinkle reduction", "collagen-boosting",
  "brightening", "dark spot reduction", "tone-evening",
  "exfoliation", "pore cleansing", "pore minimizing",
  "soothing", "anti-inflammatory", "healing",
  "barrier repair", "barrier strengthening", "skin strengthening",
  "antioxidant", "UV-protection",
  "acne-fighting", "oil-control",
  "plumping", "skin smoothing", "cell turnover",
  "repair", "cell energy", "tyrosinase inhibition",
] as const;
```

상수 위치 근거:
- L-14: 모듈 내부 전용 → enrich-service.ts 로컬
- shared/constants/에 넣지 않는 이유: 현재 enrich-service만 사용. 향후 validation/관리자 앱에서 사용 시 승격 (G-4)
- SKIN_TYPES, SKIN_CONCERNS와 달리 DB CHECK 제약 없음 → 예시일 뿐

**변경 2: INGREDIENT_CLASSIFY_SPECS에 function spec 추가**

```typescript
const INGREDIENT_CLASSIFY_SPECS: FieldSpec[] = [
  {
    fieldName: "function",
    allowedValues: INGREDIENT_FUNCTIONS,
    promptHint: "Cosmetic functions of this ingredient. Convert CosIng terms (e.g., SKIN CONDITIONING) to specific beauty-friendly terms. Use _cosing.function as reference. Return 2-4 values.",
    strict: false,
  },
  {
    fieldName: "caution_skin_types",
    allowedValues: SKIN_TYPES,
    promptHint: "Skin types that should be CAUTIOUS with this ingredient. Consider irritation and sensitivity risks.",
    // strict 미지정 = true (기존 동작 유지)
  },
];
```

**변경 3: FIELD_MAPPINGS + applyFieldMapping (inci_name 매핑)**

소스 필드명(S3 API)과 DB 필드명이 다른 경우의 직접 매핑:

```typescript
const FIELD_MAPPINGS: Partial<Record<EntityType, Record<string, (data: Record<string, unknown>) => unknown>>> = {
  ingredient: {
    inci_name: (data) => {
      const cosing = data._cosing as Record<string, unknown> | undefined;
      return data.INGR_ENG_NAME ?? cosing?.inciName ?? null;
    },
  },
};

function applyFieldMapping(data: Record<string, unknown>, entityType: EntityType): void {
  const mappings = FIELD_MAPPINGS[entityType];
  if (!mappings) return;
  for (const [targetField, extractor] of Object.entries(mappings)) {
    data[targetField] = extractor(data);
  }
}
```

enrichRecord() 호출 위치: UUID 생성 직후, 번역 전:

```typescript
// 1. deterministic UUID (기존)
data.id = generateEntityId(...);

// 1.5 소스 필드 → DB 필드 매핑 (신규)
applyFieldMapping(data, record.entityType);

// 2. 번역 (기존)
```

**translateKeys와 FIELD_MAPPINGS 분리 근거**:
- translateKeys: 한글 텍스트 → AI 번역 → LocalizedText 출력. AI 호출 필요
- FIELD_MAPPINGS: 값 직접 복사. AI 호출 불필요. 순수 함수
- 책임이 다르므로 G-2(중복 금지) 위반 아님

**규칙 검증**:
- P-7: enrich-service.ts 1파일만 수정 (기능 B+C 통합)
- G-2: classifyFields 재사용. 새 범용 함수 미생성
- G-4: INGREDIENT_FUNCTIONS, FIELD_MAPPINGS 모두 즉시 사용
- G-10: 명명 상수 (매직 문자열 없음)
- L-14: 로컬 상수/함수 (외부 export 없음)
- Q-6: applyFieldMapping ~10줄 ≤ 40줄

### 1-C. review-exporter.ts — ingredient 검수 컬럼 추가

```typescript
ingredient: [
  { header: "inci_name", source: "data", path: "inci_name", format: "string", editable: false },
  { header: "function", source: "data", path: "function", format: "array", editable: true },
  { header: "function_confidence", source: "enrichments", path: "confidence.function", format: "number", editable: false },
  { header: "caution_skin_types", source: "data", path: "caution_skin_types", format: "array", editable: true },
  { header: "caution_skin_types_confidence", source: "enrichments", path: "confidence.caution_skin_types", format: "number", editable: false },
],
```

변경 전 대비 추가: inci_name(읽기전용), function + confidence 2컬럼

**규칙 검증**:
- P-7: review-exporter.ts 1파일만 수정
- G-5: product/treatment 컬럼 정의와 동일 패턴 (field + confidence 쌍)

### 1-D. 테스트

- classifier.test.ts: strict=false 동작 테스트 (예시 외 값 수용, 빈 문자열 필터)
- enrich-service.test.ts: ingredient enrichment 시 inci_name 매핑 + function 분류 결과 포함 확인

---

## Step 2: Brands 73건 데이터 (JSON → enrich → review → load)

### 데이터 소스

P2-59 manifests에서 73개 고유 브랜드 추출 (대소문자 정규화: Clio/CLIO→Clio 등).
M1 스켈레톤 5개(Innisfree, Laneige, Sulwhasoo, COSRX, MISSHA)의 origin/tier/specialties 재사용.

### 2-A. brands-raw.json 생성

파일 위치: `scripts/seed/data/brands-raw.json`

```json
{
  "source": "manual",
  "sourceId": "innisfree",       // 소문자 slug — deterministic UUID 키
  "entityType": "brand",
  "data": {
    "name_ko": "이니스프리",
    "origin": "KR",
    "tier": "moderate",
    "is_essenly": false,
    "specialties": ["green tea", "volcanic clay", "natural ingredients"]
  },
  "fetchedAt": "2026-03-31T00:00:00Z"
}
```

sourceId 규칙: 브랜드 영문명 소문자 + 공백→하이픈 (`"beauty-of-joseon"`, `"dr-jart"`).
동일 sourceId → 동일 UUID v5 → Q-12 멱등성 보장.

### tier 분류 기준 (data-collection.md §5.5)

| tier | 가격대 기준 | 예시 | 목표 |
|------|----------|------|------|
| budget | 대표 제품 ~₩15,000 이하 | COSRX, MISSHA, The SAEM, TONYMOLY | 15+ |
| moderate | ₩15,000~₩40,000 | Innisfree, Round Lab, Anua, Torriden | 15+ |
| premium | ₩40,000~₩80,000 | Laneige, Dr.Jart+, Hera, primera | 10+ |
| luxury | ₩80,000+ | Sulwhasoo, The History of Whoo, OHUI | 5+ |
| indie | 소규모/독립 브랜드 | One Thing, Bonajour, Heimish | 5+ |

### 비한국 브랜드

| 브랜드 | origin |
|--------|--------|
| Bioderma | FR |
| Cetaphil | US |
| 나머지 전부 | KR |

### 2-B~E. CLI 실행 (환경변수 필요)

```bash
# .env.local 로딩 후 실행
npx dotenv -e .env.local -- npx tsx scripts/seed/enrich.ts \
  --input scripts/seed/data/brands-raw.json --entity-types brand

npx tsx scripts/seed/export-review.ts \
  --input scripts/seed/data/brands-enriched.json --entity-types brand

# 사용자 검수 (origin, tier 정확성)

npx dotenv -e .env.local -- npx tsx scripts/seed/import-review.ts \
  --enriched scripts/seed/data/brands-enriched.json \
  --reviewed scripts/seed/data/review/brand.csv

npx tsx scripts/seed/validate.ts --input scripts/seed/data/brands-validated.json

npx dotenv -e .env.local -- npx tsx scripts/seed/load.ts \
  --input scripts/seed/data/brands-validated.json
```

### 독립성 검증

- brands-raw.json은 순수 데이터 파일 → 코드 변경 0
- 기존 CLI(enrich/export-review/import-review/validate/load) 그대로 사용
- server/, client/, shared/ 무수정
- M1 스켈레톤과 ID 다름 → 공존 (방안 A, P2-63b에서 정리)

---

## Step 3: Ingredients 100+ 데이터 (fetch → filter → enrich → review → load)

### 실행 경로

```bash
# 1. S3+S6+S4 fetch (환경변수: MFDS_SERVICE_KEY, COSING_CSV_PATH)
npx tsx scripts/seed/fetch.ts --targets ingredients --output data/ingredients-raw.json

# 2. 100건 필터링 (P2-59 key_ingredients + KB 20종 + 주의 성분)
npx tsx scripts/seed/filter-ingredients.ts --input data/ingredients-raw.json --output data/ingredients-filtered.json

# 3. enrich (번역 + 분류: function strict:false + caution_skin_types strict:true + inci_name 매핑)
npx tsx scripts/seed/enrich.ts --input data/ingredients-filtered.json --entity-types ingredient

# 4. review export → 사용자 검수 (function, caution_skin_types — D-7 전수 검수)
# 5. review import → validate → load
```

### filter-ingredients.ts (1회성 스크립트)

P2-59 manifests의 key_ingredients + KB ingredients 20종 + 주의 성분 목록으로 필터링.
M3 전수 적재 시 이 스크립트 미사용 → 코드 변경 0.

---

## 영향 분석

### 수정 파일

| 파일 | 변경 | 영향 범위 |
|------|------|----------|
| scripts/seed/lib/enrichment/classifier.ts | FieldSpec.strict 추가 + 프롬프트/필터 분기 | scripts/seed/ 내부만 |
| scripts/seed/lib/enrich-service.ts | INGREDIENT_FUNCTIONS + function spec + FIELD_MAPPINGS + applyFieldMapping | scripts/seed/ 내부만 |
| scripts/seed/lib/review-exporter.ts | ingredient 컬럼 3개 추가 | scripts/seed/ 내부만 |

### 미수정 파일 (P-2, P-10 검증)

| 파일 | 상태 |
|------|------|
| server/core/* | 무수정 ✅ |
| server/features/* | 무수정 ✅ |
| client/* | 무수정 ✅ |
| shared/constants/beauty.ts | 무수정 ✅ |
| shared/validation/ingredient.ts | 무수정 ✅ |
| shared/validation/brand.ts | 무수정 ✅ |
| shared/types/* | 무수정 ✅ |
| scripts/seed/lib/enrichment/translator.ts | 무수정 ✅ |
| scripts/seed/lib/enrichment/description-generator.ts | 무수정 ✅ |
| scripts/seed/lib/fetch-service.ts | 무수정 ✅ |
| scripts/seed/lib/loader.ts | 무수정 ✅ |

### 의존 방향 (P-1, P-8, P-9)

```
classifier.ts ← FieldSpec 인터페이스 (strict? 추가)
  ↑ (파라미터 주입)
enrich-service.ts → classifier.ts (호출)
                  → @/shared/constants/beauty (SKIN_TYPES, SKIN_CONCERNS import)

review-exporter.ts → types.ts (타입만)
                   → csv-parser.ts (CSV 유틸)
```

역방향 없음. 순환 없음. server/ import 없음.

### 하위 호환

- strict 미지정 시 기존 동작 유지 → 기존 테스트 전수 통과
- FIELD_MAPPINGS에 ingredient만 정의 → 다른 엔티티 무영향
- review-exporter 컬럼 추가 → 기존 export/import 동작 무영향 (추가 컬럼만)
