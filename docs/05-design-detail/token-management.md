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

| 설정 | 값 | 근거 |
|------|-----|------|
| `maxTokens` | 1024 | PoC P0-15: 20턴 대화에서 응답당 ~500-800 토큰. 1024로 충분한 여유 확보 |
| `historyLimit` | 20 | PoC P0-15: 20턴 대화 3회 검증 완료. Rate limit 일 100회 (api-spec.md §4.1) |

### 1.2 상수 위치

```typescript
// shared/constants/ai.ts (기존 LLM_CONFIG와 동일 파일)

/** 모델별 토큰 설정. MVP는 default만 사용 */
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: {
    maxTokens: 1024,
    historyLimit: 20,
  },
};
```

```typescript
// shared/types/ai.ts

export interface TokenConfig {
  /** LLM 응답 최대 토큰 (streamText maxTokens) */
  maxTokens: number;
  /** 히스토리 로드 최대 턴 수 (user+assistant 쌍 기준) */
  historyLimit: number;
}
```

**기존 패턴 준수**: `LLM_CONFIG`(llm-resilience.md §2.3)와 동일한 `shared/constants/ai.ts`에 배치. 의존성 방향 변경 없음.

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
| 시스템 프롬프트 (§2-§10) | ~3,000-4,000 | system-prompt-spec.md 전체 텍스트 문자 수 / 4 (영어 기준) |
| 히스토리 20턴 (tool 포함) | ~6,000-10,000 | 턴당 300-500 토큰. PoC P0-15 실측 ~114/턴은 **tool 미포함 텍스트만** 측정 (cost-estimate.md: 2,282토큰/20턴). tool_call/tool_result 포함 시 3-4배 증가 추정 |
| tool 결과 (현재 턴) | ~500-750 | tool-spec.md: 최대 5카드 × ~150토큰 |
| 응답 예약 (maxTokens) | 1,024 | TOKEN_CONFIG.maxTokens |
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

MVP에서 v0.2로 전환 시 `TokenConfig` 인터페이스에 필드를 추가한다. 기존 코드 변경 없이 확장 가능.

```typescript
// v0.2 확장 예시 (MVP에서는 구현하지 않음)
export interface TokenConfig {
  maxTokens: number;
  historyLimit: number;
  // v0.2 추가 필드
  historyBudget?: number;    // 토큰 기반 히스토리 상한
  ragBudget?: number;        // RAG 결과 토큰 상한
  systemPromptBudget?: number; // 시스템 프롬프트 토큰 상한
}
```

### 3.2 모델별 설정 경로

`Record<string, TokenConfig>` 구조이므로 모델별 다른 값 추가 시 키만 추가.

```typescript
// v0.2 모델별 설정 예시 (MVP에서는 구현하지 않음)
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: { maxTokens: 1024, historyLimit: 20 },
  'claude-sonnet': { maxTokens: 1024, historyLimit: 20, historyBudget: 20000 },
  'gemini-flash': { maxTokens: 2048, historyLimit: 40, historyBudget: 50000 },
};
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
| maxTokens 변경 (1024 → 2048) | `shared/constants/ai.ts` (1) | 1파일 |
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
