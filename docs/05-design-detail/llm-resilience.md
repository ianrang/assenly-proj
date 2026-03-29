# LLM 복원력 설계 — P1-40 / P1-41

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: api-spec.md §3.2-3.4, security-infra.md §1, performance-caching.md §1, user-screens.md, PoC P0-18, TDD §4.1
> 원칙: core/ = 순수 팩토리 (P-2). 폴백 로직 = features/ (P-3). 정책 변경 = 1~2 파일 (P-7).

---

## 1. 모델 추상화 (P1-41)

### 1.1 core/config.ts getModel 팩토리

> ⚠️ L-4: core/ 파일 수정이므로 사용자 승인 필요.
> L-5: K-뷰티 비즈니스 용어 없음. 프로바이더/모델 팩토리만.

```typescript
// server/core/config.ts — 기존 파일에 추가
import 'server-only';

/** LLM 모델 인스턴스 반환. 비즈니스 무관 팩토리. */
export async function getModel(provider?: string) {
  const p = provider ?? env.AI_PROVIDER;
  switch (p) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(env.AI_MODEL || 'claude-sonnet-4-5-20250929');
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(env.AI_MODEL || 'gemini-2.0-flash');
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(env.AI_MODEL || 'gpt-4o');
    }
    default:
      throw new Error(`Unknown AI provider: ${p}`);
  }
}
```

> getModel()은 PoC config.ts 패턴을 core/config.ts로 이관. 프로바이더 추가 = switch case 1줄 추가만.
> getEmbeddingModel()은 search-engine.md §4.2 core/knowledge.ts에서 관리 (별도 모듈, 중복 아님).

### 1.2 환경변수 (security-infra.md §1 보완)

> 기존 변수: security-infra.md §1.1 참조. 아래는 **신규 추가분만**.

| 변수명 | 필수 | 구분 | 타입 | 기본값 | 설명 |
|--------|------|------|------|--------|------|
| `AI_FALLBACK_PROVIDER` | ❌ | 서버 | enum | `google` | 폴백 프로바이더. 빈값 = 폴백 비활성 |
| `AI_FALLBACK_MODEL` | ❌ | 서버 | string | (프로바이더 기본) | 폴백 모델명 |
| `LLM_TIMEOUT_MS` | ❌ | 서버 | number | `30000` | LLM API 호출 타임아웃 (ms) |

> security-infra.md §1.1 + §1.3 zod 스키마에 추가 필요 (D-6).

```typescript
// security-infra.md §1.3 zod 스키마 추가분
AI_FALLBACK_PROVIDER: z.enum(['anthropic', 'google', 'openai']).optional(),
AI_FALLBACK_MODEL: z.string().optional(),
LLM_TIMEOUT_MS: z.coerce.number().default(30000),
```

### 1.3 프로바이더별 차이

| 항목 | Claude Sonnet | Gemini Flash | 영향 |
|------|-------------|-------------|------|
| 토큰 제한 | 200K | 1M | MVP: Claude 주 → Gemini 폴백 (안전 방향) |
| Tool 형식 | Anthropic tool_use | Google function_calling | Vercel AI SDK가 추상화 (P0-18 검증) |
| 응답 품질 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 폴백 시 약간 품질 저하. v0.2 Gemini 프롬프트 최적화 |
| TTFT | 719~989ms (PoC) | 700~900ms | 유사 |
| 비용 | $3/MTok (input) | 무료 (Free tier) | 폴백 = 비용 절감 |

> 폴백 시 사용자에게 투명 (모델 변경 미고지). 시스템 프롬프트 동일 적용.
> v0.2: Gemini 폴백 전용 프롬프트 강화 검토 (VP-1 비개입 원칙 명시 보강).

---

## 2. 장애 대응 (P1-40)

### 2.1 재시도 정책

| 항목 | 설계 | 근거 |
|------|------|------|
| 서버 자동 재시도 | **없음** | 스트리밍 API: 이미 전송된 데이터 복원 불가. 재시도 = TTFT 2× → SLA 초과 |
| 클라이언트 재시도 | **재시도 버튼** | user-screens.md: CHAT_LLM_TIMEOUT/ERROR 시 인라인 재시도 버튼 |
| 폴백 | **1회** (다른 프로바이더) | 동일 프로바이더 재시도 아닌, 다른 프로바이더 전환 |

> 업계 표준: ChatGPT, Claude.ai 등 스트리밍 서비스에서 서버 재시도 없음. 클라이언트 재시도 위임.

### 2.2 폴백 전략 (features/chat/llm-client.ts)

```typescript
// server/features/chat/llm-client.ts
import 'server-only';
import { streamText } from 'ai';
import { getModel } from '@/server/core/config';
import { LLM_CONFIG } from '@/shared/constants/ai';

/** 주 모델 호출 → 실패 시 폴백 모델 1회 시도 */
export async function callWithFallback(options: {
  messages: Message[];
  system: string;
  tools: Record<string, Tool>;
  maxSteps: number;
}) {
  const primaryProvider = env.AI_PROVIDER;
  const fallbackProvider = env.AI_FALLBACK_PROVIDER;

  try {
    const model = await getModel(primaryProvider);
    return await streamText({
      model,
      ...options,
      abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
    });
  } catch (primaryError) {
    // 폴백 불가 조건
    if (!fallbackProvider || !shouldFallback(primaryError)) {
      throw primaryError;
    }

    // 폴백 시도
    console.warn('[LLM_FALLBACK]', {
      primary: primaryProvider,
      fallback: fallbackProvider,
      reason: (primaryError as Error).message,
    });

    try {
      const fallbackModel = await getModel(fallbackProvider);
      return await streamText({
        model: fallbackModel,
        ...options,
        abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
      });
    } catch (fallbackError) {
      // 양쪽 실패 → Q-7: 로깅 후 throw
      console.error('[LLM_ALL_FAILED]', {
        primary: { provider: primaryProvider, error: (primaryError as Error).message },
        fallback: { provider: fallbackProvider, error: (fallbackError as Error).message },
      });
      throw fallbackError;
    }
  }
}
```

### 2.3 에러 분류 + 폴백 트리거

```typescript
// shared/constants/ai.ts
export const LLM_CONFIG = {
  /** 이 HTTP 상태 코드에서 폴백 시도 */
  FALLBACK_TRIGGER_CODES: [408, 429, 500, 502, 503, 504] as const,

  /** 이 HTTP 상태 코드에서 폴백 안 함 (즉시 에러 반환) */
  NO_FALLBACK_CODES: [400, 401, 403, 404, 422] as const,

  /** 최대 시도 횟수 (1 주 + 1 폴백) */
  MAX_ATTEMPTS: 2,

  /** 폴백 전 대기 (ms) */
  FALLBACK_DELAY_MS: 100,
} as const;
```

```typescript
// features/chat/llm-client.ts
function shouldFallback(error: unknown): boolean {
  if (error instanceof Error) {
    // Vercel AI SDK 에러에서 HTTP 상태 추출
    const status = (error as { status?: number }).status;
    if (status && LLM_CONFIG.NO_FALLBACK_CODES.includes(status as typeof LLM_CONFIG.NO_FALLBACK_CODES[number])) {
      return false;
    }
    if (status && LLM_CONFIG.FALLBACK_TRIGGER_CODES.includes(status as typeof LLM_CONFIG.FALLBACK_TRIGGER_CODES[number])) {
      return true;
    }
    // 타임아웃 (AbortError)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }
    // 네트워크 에러
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      return true;
    }
  }
  return false; // 알 수 없는 에러 → 폴백 안 함
}
```

**429 구분:**

| 출처 | 도달 경로 | 폴백? | 이유 |
|------|----------|-------|------|
| 우리 rate-limit.ts | API route에서 먼저 차단 → LLM 호출 전 429 응답 | ❌ | LLM까지 도달 안 함 |
| LLM 프로바이더 (Anthropic/Google) | SDK 에러로 catch | ✅ | 프로바이더 할당량 → 다른 프로바이더 |

> rate-limit.ts가 먼저 동작하므로, SDK에서 받은 429는 **항상 LLM 프로바이더 429**. 구분 자동.

### 2.4 스트리밍 에러 처리

| 시점 | 상태 | 처리 |
|------|------|------|
| **TTFT 전 실패** | 텍스트 0바이트 | 에러 SSE 이벤트 전송 (api-spec §3.3 CHAT_LLM_ERROR) |
| **텍스트 부분 출력 후 실패** | "이 제품은..." 까지 | 에러 SSE 추가 전송. 클라이언트: 기존 출력 유지 + 에러 표시 |
| **tool-use 중 실패** | tool 호출 시작, 결과 미수신 | **전체 턴 폴백** (tool 재실행 포함) |
| **부분 메시지 DB 저장** | finish 이벤트 미수신 | **저장 안 함** (api-spec §3.4 #9: 비동기 저장은 finish 후) |

> 폴백 성공 시: 에러 SSE 없음. 사용자에게 투명 (모델 변경 미고지).
> 양쪽 실패 시: CHAT_LLM_ERROR 에러 SSE. 클라이언트 재시도 버튼 (user-screens.md 참조).

### 2.5 에지 케이스

| 항목 | 결정 | 근거 |
|------|------|------|
| 최대 시도 | 2회 (1 주 + 1 폴백) | LLM_CONFIG.MAX_ATTEMPTS |
| 토큰 사용량 | **성공한 호출만** finish 이벤트에 포함 | 실패한 주 모델 토큰은 폴백 로그에만 기록 |
| 폴백 로깅 | `console.warn('[LLM_FALLBACK]', { primary, fallback, reason })` | Q-7 + 운영 모니터링 |
| Split-brain 대화 | 시스템 프롬프트 동일 + Vercel AI SDK tool 추상화 | P0-18 검증: 프로바이더 전환 8/8 성공 |
| 폴백 비활성화 | AI_FALLBACK_PROVIDER 빈값 → shouldFallback() 항상 false | 환경변수로 제어 (코드 변경 0) |

---

## 3. 코드 배치 + 의존성

### 3.1 파일 구조

```
shared/constants/
  └── ai.ts                    # LLM_CONFIG 상수 (L-13: 순수 상수)

server/core/
  └── config.ts                # getModel() 팩토리 추가 (기존 파일, L-4 승인)
                               # L-5: K-뷰티 용어 없음

server/features/chat/
  └── llm-client.ts            # callWithFallback() (P-3: 교체 가능 leaf)
```

### 3.2 의존성 방향

```
shared/constants/ai.ts → (없음 — 순수 상수)
  ↑
features/chat/llm-client.ts → shared/constants/ai.ts + core/config.ts
  ↑
features/chat/service.ts → features/chat/llm-client.ts
  ↑
[Composition Root — CLAUDE.md L-21] → features/chat/service.ts
```

> 순환 참조 없음. core/ → features/ import 없음 (R-3).
> core/config.ts → 외부 SDK만 (@ai-sdk/*).

### 3.3 콜 스택

```
route(①) → chatService(②) → llm-client.callWithFallback(③) → config.getModel(④)
```

> P-5: 4단계 = 한계. tool handler 호출은 llm-client 내부 (SDK 콜백).

### 3.4 변경 시나리오별 수정 파일

| 변경 | 수정 파일 | P-7 |
|------|----------|-----|
| 타임아웃 변경 (30s → 15s) | `.env` (1) | ✅ 0파일 |
| 폴백 비활성화 | `.env` (1) | ✅ 0파일 |
| 폴백 프로바이더 변경 (Gemini → OpenAI) | `.env` (1) | ✅ 0파일 |
| 새 프로바이더 추가 (Mistral) | `config.ts` (1) | ✅ 1파일 |
| 폴백 트리거 조건 변경 | `shared/constants/ai.ts` (1) | ✅ 1파일 |
| Circuit breaker 추가 (v0.2) | `llm-client.ts` (1) | ✅ 1파일 |

---

## 4. v0.2+ 로드맵

| ID | 항목 | 트리거 조건 |
|----|------|-----------|
| - | Circuit breaker | 분당 실패율 > 80% → 임시 폐쇄 (5분) |
| - | Admin 설정 UI | timeout/폴백을 관리자 UI에서 hot reload (DB 기반) |
| - | Token counter | 역방향 폴백 (Gemini→Claude) 시 토큰 제한 검증 |
| - | 다중 폴백 체인 | 3+ 프로바이더 (LLM_CONFIG 배열 확장) |
| - | Gemini 프롬프트 최적화 | VP-1/DV-1~2 명시 강화로 폴백 품질 향상 |
| - | 폴백 메트릭 대시보드 | 성공률/응답시간/폴백 빈도 추적 |

---

## 5. 교차 문서 반영 (D-6)

| 문서 | 변경 | 내용 |
|------|------|------|
| **security-infra.md §1.1** | 3행 추가 | AI_FALLBACK_PROVIDER, AI_FALLBACK_MODEL, LLM_TIMEOUT_MS |
| **security-infra.md §1.3** | zod 스키마 3줄 추가 | 위 변수들의 검증 규칙 |
| **api-spec.md §3.3** | 참조 갱신 | "P1-40에서 설계" → "llm-resilience.md §2 참조" |

---

## 6. 검증 체크리스트

```
[x] D-1: api-spec §3.3 에러 코드 원문 대조 (CHAT_LLM_TIMEOUT, CHAT_LLM_ERROR, CHAT_RATE_LIMITED)
[x] D-1: security-infra §1 환경변수 원문 대조 (AI_PROVIDER, AI_MODEL 존재 확인)
[x] D-4: PoC config.ts getModel() 시그니처 호환 (switch on provider)
[x] D-5: 주 모델 실패 → shouldFallback → 폴백 모델 → 에러 SSE end-to-end
[x] D-6: 신규 3개 환경변수 → security-infra.md 반영 필요 (§5에 명시)
[x] P-2: core/config.ts = 순수 팩토리 (폴백 로직 미포함, 비즈니스 무관)
[x] P-3: features/chat/llm-client.ts 제거 시 다른 features 무영향
[x] P-5: route → chatService → llm-client → config.ts = 4단계
[x] P-7: 정책 변경 = .env 또는 shared/constants/ai.ts 1파일
[x] L-5: config.ts에 K-뷰티 용어 없음 (provider, model, timeout만)
[x] G-10: FALLBACK_TRIGGER_CODES, MAX_ATTEMPTS, FALLBACK_DELAY_MS 상수화
[x] Q-7: 폴백 실패 시 console.error + 에러 SSE (불삼킴 아님)
[x] R-3: core/config.ts → features/ import 없음
```
