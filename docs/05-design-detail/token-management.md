# 토큰 관리 설계 — P1-35

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: system-prompt-spec.md §0-§1, llm-resilience.md §1.3, api-spec.md §3.4, cost-estimate.md, PoC P0-15
> 원칙: G-10(매직 넘버 금지), P-7(단일 변경점), P-2(core 불변), L-13(shared/ 순수 상수)

---

## 0. 범위 선언

### 이 문서가 다루는 것

- MVP 토큰 설정값 확정 (`maxTokens`, `historyLimit`)
- 설정 상수의 위치와 구조 (`shared/constants/ai.ts`)
- 히스토리 로드 규칙
- MVP에서 토큰 예산 관리가 불필요한 수치 근거

### 이 문서가 다루지 않는 것

- 히스토리 요약 전략 → v0.2 (계정 인증 + 장기 대화 도입 시)
- RAG 결과 압축 → v0.2 (데이터 규모 증가 시)
- 토큰 카운터 구현 → v0.2 (비용 모니터링 필요 시)
- LLM 장애 대응 → llm-resilience.md
- 시스템 프롬프트 구조 → system-prompt-spec.md

---

## 1. MVP 토큰 설정

### 1.1 설정값

| 설정 | 값 | 위치 | 근거 |
|------|-----|------|------|
| `maxOutputTokens` | 2048 | shared/constants/ai.ts TOKEN_CONFIG | 복잡 시나리오(5카드+개인화 설명) 잘림 방지. 상한이지 실사용량 아님. (변경: 1024→2048, chat-quality-improvements.md §4) |
| `historyLimit` | 20 | shared/constants/ai.ts TOKEN_CONFIG | PoC P0-15: 20턴 대화 3회 검증 완료. Rate limit 일 100회 (api-spec.md §4.1) |
| **temperature** (v1.2) | **0.6 (default)** | **server/core/config.ts env.LLM_TEMPERATURE (SSOT)** | "warm, knowledgeable" 대화 페르소나. 추천 정확성은 코드(beauty/)가 보장하므로 안전. (변경: 0.4→0.6, chat-quality-improvements.md §4). env로 A/B 테스트 및 롤백 가능. **v1.2에서 TOKEN_CONFIG에서 제거**하고 env로 이전 (SSOT, G-2 준수) |
| `maxToolSteps` | 5 | shared/constants/ai.ts TOKEN_CONFIG | 비교 요청(검색 2회+링크) 지원. (변경: 3→5, 하드코딩→상수화, chat-quality-improvements.md §4) |

### 1.2 상수 위치 (v1.2 — SSOT 분리)

**temperature는 server/core/config.ts에만 존재** (runtime env). 나머지는 shared/constants/ai.ts에 존재:

```typescript
// shared/constants/ai.ts (기존 LLM_CONFIG와 동일 파일)

/** 모델별 토큰 설정. MVP는 default만 사용. v1.2: temperature 제거 (env.LLM_TEMPERATURE로 이전) */
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: {
    maxOutputTokens: 2048,
    historyLimit: 20,
    maxToolSteps: 5,
  },
};
```

```typescript
// shared/types/ai.ts

export interface TokenConfig {
  /** LLM 응답 최대 토큰. streamText({ maxOutputTokens }) 에 사용 (AI SDK 6.x) */
  maxOutputTokens: number;
  /** 히스토리 로드 최대 턴 수 (1턴 = user 메시지 기준, token-management.md §1.3) */
  historyLimit: number;
  /** LLM tool 호출 최대 단계 수. streamText stopWhen(stepCountIs(N))에 사용 */
  maxToolSteps: number;
  // v1.2: temperature 필드 제거 — env.LLM_TEMPERATURE가 단일 정본
}
```

```typescript
// server/core/config.ts — temperature 단일 정본 (SSOT)
const envSchema = z.object({
  // ...
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),
  // ...
});
```

**기존 패턴 준수**: shared/constants/ai.ts는 `LLM_CONFIG`(llm-resilience.md §2.3)와 동일 파일. 의존성 방향 변경 없음.

**v1.2 SSOT 근거**: shared/는 런타임 독립 상수만 보관(L-13). 서버 런타임 기본값은 server/core/에 있는 것이 올바름. 한 값이 두 곳에 선언되면 G-2(중복 금지), G-10(매직 넘버 금지), P-7(단일 변경점), V-25(정본 확인) 위반. SSOT로 전부 해소.

### 1.3 히스토리 로드 규칙

api-spec.md §3.4 step 4 "히스토리 로드"에서 적용:

```
최근 historyLimit 턴의 메시지를 로드한다.
- 1턴 = user 메시지 1개 + assistant 응답(tool_call/tool_result 포함)
- DB 쿼리: 최근 historyLimit 턴을 턴 단위로 조회
  - 턴 식별: user 메시지를 기준으로 역순 정렬, 최근 historyLimit개 선택
  - 선택된 턴에 속하는 모든 메시지(tool_call, tool_result, assistant 포함) 로드
- 결과를 시간순 정렬 후 LLM에 전달
```

> **tool 메시지 저장 모델**: Vercel AI SDK `onFinish`에서 tool_call/tool_result가 별도 행으로 저장될 수 있다. 1턴에 tool 2회 호출 시 최대 6행(user + tool_call×2 + tool_result×2 + assistant). 따라서 단순 `LIMIT (N * 2)` 방식은 사용하지 않고, **턴(user 메시지) 기준으로 조회**한다. 구체적 쿼리 구현은 Phase 2.

> **엣지 케이스**: (1) 첫 메시지(0턴): 히스토리 0건, 시스템 프롬프트만으로 LLM 호출. 정상 동작. (2) 불완전 턴(user만 존재, assistant 응답 실패): LLM이 trailing user 메시지를 자연스럽게 처리. 별도 필터링 불필요.

---

## 2. MVP에서 토큰 예산 관리가 불필요한 근거

### 2.1 사용량 분석

| 영역 | 추정 토큰 | 산출 근거 |
|------|----------|----------|
| 시스템 프롬프트 (§2-§11, 축약+few-shot 후) | ~2,500-3,500 | system-prompt-spec.md 전체 텍스트. 550줄→379줄 축소(few-shot 60줄 순증 포함) (chat-quality-improvements.md §2) |
| 히스토리 20턴 (tool 포함) | ~6,000-10,000 | 턴당 300-500 토큰. PoC P0-15 실측 ~114/턴은 **tool 미포함 텍스트만** 측정 (cost-estimate.md: 2,282토큰/20턴). tool_call/tool_result 포함 시 3-4배 증가 추정 |
| tool 결과 (현재 턴) | ~500-750 | tool-spec.md: 최대 5카드 × ~150토큰 |
| ~~의도 분류~~ | ~~~120~~ | **v0.2 후속** — v0.1 범위 제외 (chat-quality-improvements.md §3 v1.1 결정). v0.1에서는 메인 LLM만 호출 |
| 응답 예약 (maxOutputTokens) | 2,048 | TOKEN_CONFIG.maxOutputTokens (1024→2048 변경) |
| **합계** | **~10,500-15,800** | |
| **200K 대비** | **5.3%-7.9%** | |

### 2.2 물리적 상한

| 제약 | 값 | 근거 |
|------|-----|------|
| 컨텍스트 윈도우 | 200,000 토큰 | llm-resilience.md §1.3 (Claude Sonnet) |
| Rate limit (분당) | 5회 | api-spec.md §4.1 |
| Rate limit (일일) | 100회 | api-spec.md §4.1 |
| 대상 사용자 | 익명 여행객 | 짧은 세션이 대부분 (PRD §1.5) |

Rate limit 일 100회 × 턴당 최대 1,000 토큰 = 100K. 시스템 프롬프트 4K + 히스토리 누적 고려해도 200K를 초과할 수 없다.

### 2.3 결론

MVP에서 컨텍스트 윈도우 초과는 **물리적으로 불가능**하다. 영역별 세밀한 예산 배분, 히스토리 요약, RAG 압축은 불필요하다. `maxTokens`와 `historyLimit` 2개 값으로 충분하다.

---

## 3. 확장 구조 (v0.2 대비)

### 3.1 TokenConfig 확장 경로

MVP(v0.1)에서 v0.2로 전환 시 `TokenConfig` 인터페이스에 필드를 추가한다. 기존 코드 변경 없이 확장 가능.

```typescript
// v0.2 확장 예시 (MVP에서는 구현하지 않음)
export interface TokenConfig {
  maxOutputTokens: number;
  historyLimit: number;
  maxToolSteps: number;
  // v0.2 추가 필드
  historyBudget?: number;    // 토큰 기반 히스토리 상한
  ragBudget?: number;        // RAG 결과 토큰 상한
  systemPromptBudget?: number; // 시스템 프롬프트 토큰 상한
  // 주의: temperature는 env.LLM_TEMPERATURE가 정본 (v0.1 SSOT 결정). v0.2에서 per-model로 다시 가져올 경우 env 구조를 LLM_TEMPERATURE_CLAUDE, LLM_TEMPERATURE_GEMINI 등으로 확장하거나, TokenConfig에 optional override 필드 추가 후 env가 null일 때만 사용
}
```

### 3.2 모델별 설정 경로

`Record<string, TokenConfig>` 구조이므로 모델별 다른 값 추가 시 키만 추가.

```typescript
// v0.2 모델별 설정 예시 (MVP에서는 구현하지 않음)
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: { maxOutputTokens: 2048, historyLimit: 20, maxToolSteps: 5 },
  'claude-sonnet': { maxOutputTokens: 2048, historyLimit: 20, maxToolSteps: 5, historyBudget: 20000 },
  'gemini-flash': { maxOutputTokens: 4096, historyLimit: 40, maxToolSteps: 5, historyBudget: 50000 },
};
// v0.1 SSOT: temperature는 env.LLM_TEMPERATURE에서만 읽음. TOKEN_CONFIG에는 포함 안 함.
```

### 3.3 히스토리 로드 확장 경로

MVP의 턴 수 기반 로드를 토큰 기반으로 전환 시, 로드 함수의 내부 구현만 변경. 호출부(service.ts)는 변경 불필요.

```
MVP:  loadRecentMessages(conversationId, config.historyLimit)
       → SELECT ... ORDER BY created_at DESC LIMIT (limit * 2)

v0.2: loadRecentMessages(conversationId, config.historyLimit, config.historyBudget)
       → 턴 수 제한 + 토큰 예산 초과 시 오래된 턴 제거
       → 추후 요약 로직 추가 시 이 함수 내부에서 처리
```

### 3.4 변경 시나리오별 수정 파일

| 변경 | 수정 파일 | P-7 |
|------|----------|-----|
| maxOutputTokens/temperature/maxToolSteps 변경 | `shared/constants/ai.ts` (1) | 1파일 |
| 히스토리 턴 수 변경 (20 → 30) | `shared/constants/ai.ts` (1) | 1파일 |
| 모델별 다른 설정 추가 | `shared/constants/ai.ts` (1) | 1파일 |
| TokenConfig에 새 필드 추가 | `shared/types/ai.ts` (1) + `shared/constants/ai.ts` (1) | 2파일 |
| 히스토리 로드를 토큰 기반으로 전환 | `features/chat/` 내부 (1) | 1파일 (*) |
| 히스토리 요약 로직 추가 | `features/chat/` 내부 (1) | 1파일 (*) |

> (*) TokenConfig에 새 필드 추가(2파일)가 선행 전제. 요약은 기존 LLM 호출 인프라(llm-client.ts)를 재사용하므로 별도 모듈 불필요.

---

## 4. 의존성 방향

```
shared/types/ai.ts (TokenConfig 타입) → (없음)
  ↑
shared/constants/ai.ts (TOKEN_CONFIG + LLM_CONFIG) → shared/types/ai.ts
  ↑
features/chat/service.ts → shared/constants/ai.ts
  ↑
[Composition Root — CLAUDE.md L-21] → features/chat/service.ts
```

기존 llm-resilience.md §3.2 의존성 체인에 추가 레이어 없음. `TOKEN_CONFIG`는 `LLM_CONFIG`와 동일 파일에 배치.

---

## 5. v0.2 연기 항목

| 항목 | 트리거 조건 | 참조 |
|------|-----------|------|
| 히스토리 요약 전략 | 계정 인증 도입 + 장기 대화(재방문) 지원 시 | TDD §3.4 |
| RAG 결과 압축 | 데이터 규모 증가 (500건 → 5,000건+) 시 | search-engine.md |
| 토큰 카운터 | 비용 모니터링에서 토큰 급증 감지 시 | cost-estimate.md §7 |
| 모델별 다른 예산 | 역방향 폴백(Gemini→Claude) 도입 시 | llm-resilience.md §4 |
| 토큰 기반 히스토리 로드 | 턴당 토큰 변동이 커서 턴 수 기반이 부정확할 때 | 모니터링 결과 기반 |

---

## 검증 체크리스트

```
[x] V-1  의존성 방향: shared/constants/ → shared/types/ (DAG 준수)
[x] V-2  core 불변: core/ 파일 수정 없음
[x] V-3  Composition Root: 해당 없음 (상수 정의)
[x] V-4  features 독립: features/ 간 직접 import 없음
[x] V-6  바인딩 체인: shared/ 내부 1단계 (types → constants)
[x] V-12 any 타입 없음
[x] D-CHK-1 llm-resilience.md §1.3, §3.2 원문 대조 완료
[x] D-CHK-2 3시나리오: 정상 20턴(10K/200K=5%), 극단 100턴(물리적 불가), 빈 대화(시스템 프롬프트만 4K)
[x] D-CHK-4 TokenConfig 타입이 기존 ai.ts 패턴과 호환
[x] D-CHK-6 system-prompt-spec.md §0 "P1-35 참조" → 본 문서로 해소
```
