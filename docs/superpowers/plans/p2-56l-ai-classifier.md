# P2-56l: AI 분류 모듈 (classifier.ts)

## Context

Stage 2 Enrichment의 두 번째 AI 모듈. 제품/시술/성분의 뷰티 속성(skin_types, concerns 등)을 AI로 분류하고 confidence 점수를 반환.

**선행 완료**: P2-56k (translator + ai-client ✅), P2-56c (types ✅)

---

## 설계 결정 (전문가 리뷰 완료)

### D-1. 범용 함수 시그니처 — classifyFields(inputData, fieldSpecs)

호출자(enrich-service)가 "어떤 필드를 어떤 허용값으로 분류할지" 결정. classifier는 엔티티 무관.

- P-4: 조합은 Composition Root(enrich-service) 책임
- P-7: 새 엔티티 추가 = enrich-service만 수정, classifier 수정 0건
- G-5: translator.ts 패턴과 일관 (호출자가 scope 결정)

### D-2. FieldSpec에 promptHint 포함

동일 허용값(SKIN_TYPES)이지만 분류 의미가 다름:
- product.skin_types = "적합한" 피부 타입
- ingredient.caution_skin_types = "주의해야 할" 피부 타입

promptHint로 분류 의미를 전달하여 정확도 보장.

### D-3. AI self-report confidence (1회 호출)

- data-collection.md: "confidence 점수는 검수 우선순위 참고용 (자동 승인 없음)"
- 비용: 200건 ~$2 (1회 호출 전제)
- P2-56r에서 정확도 별도 검증

### D-4. classifier.ts는 shared/constants 직접 import 안 함

enrich-service가 SKIN_TYPES 등을 가져와 fieldSpecs.allowedValues로 전달.
translator.ts가 shared/constants를 import하지 않는 것과 일관.

---

## 파일 목록

### 신규 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/enrichment/classifier.ts` | AI 분류 모듈 |
| `scripts/seed/lib/enrichment/classifier.test.ts` | 단위 테스트 |

### 수정 (0개)

---

## 타입 정의

```typescript
/** 분류할 필드 명세 */
export interface FieldSpec {
  fieldName: string;                  // DB 필드명: "skin_types", "concerns" 등
  allowedValues: readonly string[];   // 허용값 배열
  promptHint: string;                 // 분류 지시 문맥
}

/** 개별 필드 분류 결과 */
interface FieldClassification {
  values: string[];       // 분류된 값 배열 (allowedValues 내에서만)
  confidence: number;     // 0.0~1.0
}

/** classifyFields 반환 타입 */
export interface ClassifyResult {
  classified: Record<string, FieldClassification>;  // fieldName → 결과
  classifiedFields: string[];                       // EnrichmentMetadata.classifiedFields용
}
```

## 코드 구조

### classifier.ts

```typescript
// scripts/seed/lib/enrichment/classifier.ts
// Stage 2 AI 분류 — data-pipeline.md §3.2.2
// P-9: scripts/ 내부 + shared/ type import만. server/ import 금지.

import { generateText } from "ai";
import { getPipelineModel } from "./ai-client";

// ── 타입 (L-14: enrichment/ 전용) ──
export interface FieldSpec { ... }
export interface ClassifyResult { ... }
interface FieldClassification { ... }  // 비공개

// ── 입력 타입 ──
type ClassifyInputData = Record<string, string | string[] | number | null | undefined>;

// ── 프롬프트 구성 ──
function buildClassificationPrompt(
  inputData: ClassifyInputData,
  fieldSpecs: readonly FieldSpec[],
): string { ... }

// ── 응답 파싱 ──
function parseClassificationResponse(
  text: string,
  fieldSpecs: readonly FieldSpec[],
): Record<string, FieldClassification> | null { ... }

// ── 폴백 헬퍼 ──
function buildEmptyResult(
  fieldSpecs: readonly FieldSpec[],
): ClassifyResult { ... }

// ── 메인 함수 ──
export async function classifyFields(
  inputData: ClassifyInputData,
  fieldSpecs: readonly FieldSpec[],
): Promise<ClassifyResult> { ... }
```

---

## 의존 방향

```
classifier.ts → ai-client.ts     (getPipelineModel)
             → ai                (generateText — 외부 라이브러리)

enrich-service (P2-56o, 미구현) → classifier.ts  (classifyFields)
                                → shared/constants (SKIN_TYPES 등 → fieldSpecs로 전달)
```

역방향 없음. 순환 없음. server/ import 없음. shared/constants 직접 import 없음.

---

## 프롬프트 설계

```
You are a K-beauty product classification expert.

Given the following product/ingredient/treatment information:
{inputData를 key: value로 직렬화}

Classify into the following categories:

1. {fieldSpec.fieldName} — {fieldSpec.promptHint}
   Allowed values: {fieldSpec.allowedValues.join(", ")}

2. ...

Rules:
- Select ONLY from the allowed values listed above
- Return multiple values where applicable (arrays)
- Provide a confidence score (0.0-1.0) for each classification
- Return ONLY valid JSON

Return JSON:
{
  "<fieldName>": {
    "values": ["value1", "value2"],
    "confidence": 0.85
  }
}
```

---

## 에러 처리

- AI 호출 실패 → 빈 결과 반환 (values: [], confidence: 0)
- JSON 파싱 실패 → 빈 결과 반환
- 허용값 외 값 → 필터링하여 제거 (허용값 내 값만 유지)
- confidence 범위 외 → 0.0~1.0으로 클램핑
- fieldSpecs 비어있음 → 빈 결과 즉시 반환

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-2 | core/ 수정 없음 |
| P-4 | 조합은 enrich-service 책임. classifier는 범용 도구 |
| P-5 | enrich-service → classifyFields → getPipelineModel → SDK. **3단계** |
| P-7 | 새 엔티티 = enrich-service만 수정. 프로바이더 변경 = ai-client만 |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부 import만. shared/constants 직접 import 없음 |
| P-10 | 삭제해도 core/, features/, client/ 빌드 에러 없음 |
| G-2 | translator와 책임 다름 (번역 vs 분류). ai-client 공유는 정당한 재사용 |
| G-4 | 미사용 코드 없음. hair_types 전용 로직 없음 |
| G-5 | translator.ts 패턴: 호출자가 scope 결정, 모듈은 실행만 |
| G-8 | any 없음 |
| G-9 | export: classifyFields, ClassifyResult, FieldSpec |
| G-10 | 허용값은 파라미터로 수신. 매직값 없음 |

---

## 테스트 계획

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | 정상 분류 — 단일 필드 (skin_types) | classified.skin_types.values + confidence |
| 2 | 정상 분류 — 복수 필드 (skin_types + concerns) | 2개 필드 동시 분류 |
| 3 | 허용값 외 값 필터링 | AI가 "oily_dry" 등 반환 → 제거, 유효값만 유지 |
| 4 | 빈 fieldSpecs → 빈 결과 | AI 호출 없음 |
| 5 | AI 호출 실패 → 빈 결과 | values: [], confidence: 0 |
| 6 | JSON 파싱 실패 → 빈 결과 | 비정상 응답 텍스트 |
| 7 | 유효하지 않은 JSON (브레이스 있으나 파싱 실패) | JSON.parse catch 경로 |
| 8 | confidence 범위 클램핑 | 1.5 → 1.0, -0.3 → 0.0 |
| 9 | AI 응답에 일부 필드 누락 → 해당 필드만 빈 결과 | 부분 성공 |
| 10 | 마크다운 코드 펜스 포함 → 정상 파싱 | regex 추출 |
| 11 | promptHint가 프롬프트에 포함되는지 검증 | 프롬프트 내용 확인 |
| 12 | inputData 직렬화 — 문자열/배열/숫자/null 처리 | 프롬프트 안전성 |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit 에러 0건 (scripts/ 관련)
□ 코드 경로 전수 매핑: 모든 if/else/switch/try/catch/early return에 대응 테스트 존재
□ 문자열 보간 전수 검증: ${variable} 사용 시 특수문자 안전성 확인
```
