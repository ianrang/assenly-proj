# P2-56k: AI 번역 모듈 (translator.ts)

## Context

Stage 2 Enrichment의 첫 번째 AI 모듈. RawRecord.data의 한국어 필드를 6언어 LocalizedText JSONB 형식으로 번역.
ko→en 필수, ja/zh/es/fr 선택 (일괄 실행).

**선행 완료**: P2-56c (types ✅), P2-5 (AI 엔진 + LLM client ✅)

---

## 설계 결정

### D-1. 파이프라인 전용 모델 팩토리 (ai-client.ts)

server/core/config.ts의 getModel()을 직접 import할 수 없음:
- server/core/config.ts 89번줄: `envSchema.parse(process.env)` — 모듈 로드 시 즉시 실행
- ADMIN_JWT_SECRET, ENCRYPTION_KEY 등 15개 환경변수가 파이프라인에 없음 → parse 에러
- P-9는 `scripts/ → server/core/` import를 규칙상 허용하나, 기술적으로 불가능

따라서 `scripts/seed/lib/enrichment/ai-client.ts`에 파이프라인 전용 팩토리 작성:
- pipelineEnv.AI_PROVIDER / AI_MODEL 기반
- Fallback 로직 없음 (파이프라인은 AI_FALLBACK_PROVIDER 미지원)
- P2-56k/l/m 3개 모듈이 공유 → P-7 단일 변경점
- G-2 미위반: 환경변수 소스·폴백 로직이 다르므로 동일 함수 아님

### D-2. 함수 시그니처 — 필드 맵 + 언어 목록

```typescript
translateFields(
  fields: Record<string, string>,  // { name: "이니스프리 그린티 세럼", description: "수분 세럼..." }
  targetLangs?: string[],          // 기본 ["en"], 선택 ["en", "ja", "zh", "es", "fr"]
): Promise<TranslateResult>
```

- 번역 대상 필드 결정은 enrich-service(P2-56o) 책임
- translator는 "주어진 텍스트 → 번역" 순수 AI 호출 모듈
- 설계 문서: "엔티티 단위 (name + description을 하나의 프롬프트로)" — data-pipeline.md §3.2.2

### D-3. 출력 형식 — LocalizedText

```typescript
interface TranslateResult {
  translated: Record<string, LocalizedText>;  // { name: { ko: "...", en: "...", ja: "..." } }
  translatedFields: string[];                 // ["name", "description"]
}
```

- schema.dbml: `name jsonb [not null, note: 'LocalizedText {ko, en, ja, zh, es, fr}']`
- shared/types/domain.ts: `LocalizedText = { en: string; ko?: string; ja?: string; ... }`
- DB 적재 형식과 동일 → 변환 레이어 불필요

### D-4. 에러 처리 — ko 폴백

data-pipeline.md §3.4.1 명시:
> 번역 실패 → name.en = name.ko 폴백 (추후 수동 보완)

- translateFields는 throw하지 않음
- AI 호출 실패 시: 원본 한국어를 en 값으로 폴백
- 개별 필드 실패도 격리 (전체 실패 아님)

### D-5. 프롬프트 설계

- 입력: 여러 필드의 한국어 텍스트
- 출력: JSON 형식으로 각 필드의 번역 결과
- K-뷰티 도메인 컨텍스트 제공 (제품명, 성분명 등 전문 용어)
- generateText + JSON 파싱 (structured output)

### D-6. DEFAULT_TARGET_LANGS 상수

```typescript
const DEFAULT_TARGET_LANGS = ["en"] as const;
const ALL_TARGET_LANGS = ["en", "ja", "zh", "es", "fr"] as const;
```

- ko→en은 필수 (data-pipeline.md §3.2.2)
- 기본값 ["en"], 전체 번역 시 ALL_TARGET_LANGS 전달
- G-10: 매직 넘버/문자열 상수화

---

## 파일 목록

### 신규 (3개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/enrichment/ai-client.ts` | 파이프라인 전용 AI 모델 팩토리 |
| `scripts/seed/lib/enrichment/translator.ts` | 번역 모듈 (ko→en+4언어) |
| `scripts/seed/lib/enrichment/translator.test.ts` | 단위 테스트 |

### 수정 (0개)

config.ts, types.ts, 기존 프로바이더 전체, core/, features/, shared/ — 수정 없음.

---

## 코드 구조

### ai-client.ts (파이프라인 전용 모델 팩토리)

```typescript
// scripts/seed/lib/enrichment/ai-client.ts
// P-9: scripts/ → shared/ 허용. server/core/config.ts import 불가 (env parse 실패).
// P-7: 프로바이더 변경 = 이 파일 + .env만.

import { pipelineEnv } from "../../config";

type AIProvider = "anthropic" | "google";

// server/core/config.ts:97-100 DEFAULT_MODELS와 동일한 값 사용
const DEFAULT_MODELS: Record<AIProvider, string> = { ... };

export async function getPipelineModel() {
  const provider = pipelineEnv.AI_PROVIDER;
  const modelName = pipelineEnv.AI_MODEL ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelName);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
```

### translator.ts (번역 엔진)

```typescript
// scripts/seed/lib/enrichment/translator.ts
// Stage 2 AI 번역 — data-pipeline.md §3.2.2
// P-9: scripts/ 내부 + shared/ import만. server/ import 금지.

import { generateText } from "ai";
import type { LocalizedText } from "@/shared/types";
import { getPipelineModel } from "./ai-client";

// ── 상수 ──
const DEFAULT_TARGET_LANGS = ["en"] as const;
const ALL_TARGET_LANGS = ["en", "ja", "zh", "es", "fr"] as const;

// ── 타입 ──
export interface TranslateResult {
  translated: Record<string, LocalizedText>;
  translatedFields: string[];
}

// ── 프롬프트 ──
function buildTranslationPrompt(
  fields: Record<string, string>,
  targetLangs: readonly string[],
): string { /* ... */ }

// ── 응답 파싱 ──
function parseTranslationResponse(
  text: string,
  fields: Record<string, string>,
  targetLangs: readonly string[],
): Record<string, LocalizedText> { /* JSON.parse + fallback */ }

// ── 메인 함수 ──
export async function translateFields(
  fields: Record<string, string>,
  targetLangs?: readonly string[],
): Promise<TranslateResult> {
  const langs = targetLangs ?? DEFAULT_TARGET_LANGS;
  const fieldNames = Object.keys(fields).filter((k) => fields[k]?.trim());

  if (fieldNames.length === 0) {
    return { translated: {}, translatedFields: [] };
  }

  try {
    const model = await getPipelineModel();
    const result = await generateText({ model, prompt: buildTranslationPrompt(fields, langs) });
    const translated = parseTranslationResponse(result.text, fields, langs);
    return { translated, translatedFields: Object.keys(translated) };
  } catch {
    // 폴백: ko 원문을 en으로 복사 (data-pipeline.md §3.4.1)
    const fallback: Record<string, LocalizedText> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value?.trim()) {
        fallback[key] = { en: value, ko: value };
      }
    }
    return { translated: fallback, translatedFields: Object.keys(fallback) };
  }
}

export { DEFAULT_TARGET_LANGS, ALL_TARGET_LANGS };
```

---

## 의존 방향

```
translator.ts → ai-client.ts    (getPipelineModel — 파이프라인 전용)
             → types.ts         (type import — TranslateResult 내부 정의)
             → @/shared/types   (type import — LocalizedText)
             → ai               (generateText — 외부 라이브러리)

ai-client.ts → ../../config     (pipelineEnv — 환경변수)
             → @ai-sdk/anthropic (dynamic import)
             → @ai-sdk/google   (dynamic import)
```

역방향 없음. 순환 없음. server/ import 없음. core/ 수정 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-2 | core/ 수정 없음 |
| P-5 | enrich-service → translateFields → getPipelineModel → SDK. **3단계** |
| P-7 | AI 프로바이더 변경 = ai-client.ts + .env만 |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부 + shared/ type import만. server/ import 없음 |
| P-10 | 삭제해도 core/, features/, client/ 빌드 에러 없음 |
| G-2 | server/core/config.ts의 getModel과 환경변수 소스·폴백 로직 다름 — 중복 아님 |
| G-3 | translateFields: 프롬프트 구성 + AI 호출 + 응답 파싱 + 폴백 (패스스루 아님) |
| G-4 | P2-56o (enrich-service)에서 사용. P2-56l/m도 ai-client 사용 |
| G-5 | Layer 1 프로바이더 패턴: export 매핑함수 + 메인함수, 상수 분리 |
| G-8 | any 없음. unknown + 타입 가드 |
| G-9 | export: translateFields, TranslateResult, DEFAULT_TARGET_LANGS, ALL_TARGET_LANGS, getPipelineModel |
| G-10 | DEFAULT_TARGET_LANGS, ALL_TARGET_LANGS, DEFAULT_MODELS 상수 |
| L-14 | TranslateResult는 enrichment/ 전용. shared/에 넣지 않음 |
| N-2 | translator.ts, ai-client.ts (kebab-case) |
| N-4 | translateFields, getPipelineModel, buildTranslationPrompt (camelCase 동사) |
| Q-7 | catch에서 폴백 반환 (에러 불삼킴 아님 — 설계 문서 명시 폴백) |
| Q-8 | process.env 직접 접근 없음. pipelineEnv 경유 |

---

## 테스트 계획

generateText mock으로 실제 AI 호출 없이 테스트.

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | translateFields 정상 — ko→en 단일 필드 | translated.name = { ko, en }, translatedFields = ["name"] |
| 2 | translateFields 정상 — ko→en 복수 필드 | name + description 동시 번역 |
| 3 | translateFields 정상 — 전체 6언어 | targetLangs = ALL_TARGET_LANGS, 5개 언어 출력 |
| 4 | 빈 필드 → 빈 결과 | fields = {} 또는 모든 값 빈 문자열 → translated = {} |
| 5 | AI 호출 실패 → ko 폴백 | generateText throw → en = ko 원문 |
| 6 | AI 응답 JSON 파싱 실패 → ko 폴백 | 비정상 응답 텍스트 → 폴백 |
| 7 | 기본 targetLangs = ["en"] | targetLangs 미전달 시 en만 |
| 8 | 부분 필드만 값 있음 | { name: "세럼", description: "" } → name만 번역 |
| 9 | getPipelineModel — anthropic | AI_PROVIDER=anthropic 시 anthropic() 호출 |
| 10 | getPipelineModel — google | AI_PROVIDER=google 시 google() 호출 |
| 11 | getPipelineModel — 커스텀 모델명 | AI_MODEL 설정 시 해당 모델명 사용 |
| 12 | getPipelineModel — 미지원 프로바이더 | throw Error |

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
□ npx tsc --noEmit 에러 0건
```
