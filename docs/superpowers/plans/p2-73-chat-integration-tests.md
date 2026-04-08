# P2-73: Chat API Integration Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POST /api/chat의 route → service → tool → DB 전체 오케스트레이션을 실제 DB 연동 + LLM 모킹으로 통합 테스트. P2-79 완료 후 인증-채팅 E2E 체인 검증 포함.

**Architecture:** P2-71에서 구축한 통합 테스트 인프라(vitest.integration.config.ts, helpers.ts, setup.ts)를 그대로 재사용. 신규 파일 1개만 추가. production 코드 수정 0건. 테스트 코드는 `src/__tests__/integration/`에 독립 배치하여 비즈니스/코어 코드에 역참조 0건.

**Tech Stack:** Vitest 4.x (node env) + Hono `app.request()` + AI SDK `MockLanguageModelV3` + `simulateReadableStream` (`ai/test`, `ai`) + Supabase JS v2 (`signInAnonymously`, `service_role`) + 기존 route/service/tool 코드 (수정 없이 호출만)

**LLM 모킹 전략:** `callWithFallback`를 `vi.mock`으로 대체. 내부에서 AI SDK `streamText` + `MockLanguageModelV3`를 직접 호출하여 결정적 tool call 시퀀스를 반환. 이로써:
- `streamText`는 **실제 AI SDK 코드**가 실행됨
- `MockLanguageModelV3`의 `doStream` 배열로 multi-step 제어 (step 1: tool call → step 2: text 응답)
- tool의 `execute` 함수가 **실제 DB를 쿼리**함
- `callWithFallback`만 대체하므로 `llm-client.ts` 수정 없음

**전제:** dev Supabase DB에 P2-60~64 시드 데이터 + P2-64d 임베딩 존재. 시드 미존재 시 tool 실행 테스트는 `describe.skipIf()`로 스킵.

**P2-71/72와의 경계:**
- P2-71: GET /api/chat/history 포함 15개 엔드포인트 (POST /api/chat 제외)
- P2-72: DB 필터 + vector RPC 기계적 정확성 (search-handler 독립 검증)
- **P2-73: POST /api/chat 전체 경로 — route → service → tool execute → DB → SSE 응답 → onFinish DB 저장**

---

## File Structure

| 구분 | 파일 | 책임 |
|------|------|------|
| Create | `src/__tests__/integration/chat-api.integration.test.ts` | POST /api/chat 통합 테스트 (10건) |

**의존 방향 (단방향만):**
```
chat-api.integration.test.ts
  → src/server/features/api/app.ts          (createApp — Hono 인스턴스)
  → src/server/features/api/routes/chat.ts  (registerChatRoutes)
  → src/__tests__/integration/helpers.ts    (createRegisteredTestUser, cleanupTestUser 등)
  → ai/test                                (MockLanguageModelV3)
  → ai                                     (streamText, simulateReadableStream)

vi.mock 대상 (테스트 내에서만 적용):
  → @/server/features/chat/llm-client      (callWithFallback → streamText + MockModel로 대체)

역방향 없음:
  src/server/ → src/__tests__/ ✗
  src/client/ → src/__tests__/ ✗
  src/shared/ → src/__tests__/ ✗
```

**production 코드 수정: 0건.** 모든 변경은 테스트 파일 1개에만 한정.

---

## 규칙 준수 검증

| 규칙 | 준수 방법 |
|------|----------|
| P-1 DAG | 테스트 → server/ 단방향. 역방향 없음 |
| P-2 Core 불변 | core/ 수정 0건 |
| P-10 제거 안전성 | 테스트 파일 삭제해도 core/features/client/shared에 영향 0 |
| R-1~R-4 계층 의존 | 테스트는 app 계층에서 route만 import. 계층 위반 없음 |
| L-0a server-only | setup.ts에서 vi.mock('server-only') — 기존 패턴 재사용 |
| G-1 기존 코드 분석 | P2-71/72 테스트 패턴 + chat route/service/tool 전수 분석 완료 |
| G-2 중복 금지 | helpers.ts 재사용, 신규 헬퍼 미생성. P2-71 chat-history와 중복 없음 (GET vs POST) |
| G-4 미사용 코드 금지 | 모든 함수/변수가 테스트에서 사용됨 |
| G-5 기존 패턴 따르기 | P2-71 chat-history-routes 패턴과 동일 구조 |
| V-17 제거 안전성 | 테스트 파일 삭제 시 빌드/다른 테스트 영향 0 |

---

## LLM 모킹 상세 설계

### Mock 구조

```typescript
import { streamText, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

// vi.mock은 테스트 파일 스코프에서만 적용됨
vi.mock('@/server/features/chat/llm-client', () => ({
  callWithFallback: async (options: CallOptions) => {
    return streamText({
      model: mockModel,      // MockLanguageModelV3 인스턴스
      ...options,             // messages, system, tools, stopWhen 그대로 전달
    });
  },
}));
```

### Multi-step Tool Call 시퀀스

`MockLanguageModelV3`의 `doStream`을 **함수**로 구현하여 호출 횟수에 따라 다른 응답 반환:

```
Step 1 (doStream 1번째 호출):
  → tool-input-start: { toolName: 'search_beauty_data', id: 'call-1' }
  → tool-input-delta: { delta: '{"query":"moisturizer","domain":"shopping","limit":3}' }
  → tool-input-end: { id: 'call-1' }
  → finish: { finishReason: { unified: 'tool-calls' } }
  
  → AI SDK가 search_beauty_data.execute() 호출 → 실제 DB 쿼리

Step 2 (doStream 2번째 호출):
  → text-start: { id: 'text-1' }
  → text-delta: { delta: 'Here are some great moisturizers...' }
  → text-end: { id: 'text-1' }
  → finish: { finishReason: { unified: 'stop' } }
```

### Text-only Mock (tool call 미포함)

tool 실행이 불필요한 테스트 (인증, 입력 검증, conversation 생성 등)용:

```
doStream 1번만 호출:
  → text-start + text-delta + text-end + finish (stop)
```

---

## 테스트 케이스 상세

### 구조

```
describe('POST /api/chat (integration)')
  beforeAll: createApp() + registerChatRoutes + createRegisteredTestUser
  afterAll: cleanupTestUser

  describe('인증 + 입력 검증')
    C-01: 미인증 → 401
    C-02: 잘못된 body (빈 객체) → 400
    C-03: message.parts에 빈 text → 400

  describe('대화 생성 + 스트리밍')
    C-04: 새 대화 생성 (conversation_id: null) → 200 + SSE + DB에 conversation 생성
    C-05: 기존 대화 계속 (유효한 conversation_id) → 200 + SSE
    C-06: 타인 대화 접근 차단 (다른 유저의 conversation_id) → 500 (Conversation not found)

  describe('Tool 실행 (실제 DB)')
    C-07: search_beauty_data tool call → tool-input 이벤트 검증 (mock LLM → service → tool 등록 체인)

  describe('onFinish 후처리')
    C-08: 스트림 완료 후 DB에 ui_messages 저장 검증

  describe('에러 처리')
    C-09: LLM 실패 (callWithFallback throw) → 500 + CHAT_LLM_ERROR
    C-10: 프로필 없는 사용자 → 정상 동작 (profile null 허용)
```

### 테스트 케이스 상세

**C-01: 미인증 → 401**

```
요청: POST /api/chat (Authorization 헤더 없음)
검증: res.status === 401
```

**C-02: 잘못된 body → 400**

```
요청: POST /api/chat + 인증 + body: {}
검증: res.status === 400, json.error.code === 'VALIDATION_FAILED'
```

**C-03: message.parts에 빈 text → 400**

```
요청: POST /api/chat + 인증 + body: { message: { id: 'x', role: 'user', parts: [{ type: 'text', text: '' }] } }
검증: res.status === 400
```

**C-04: 새 대화 생성 → 200 + SSE + conversation DB 생성**

```
Mock: text-only (tool call 없음)
요청: POST /api/chat + 인증 + body: { message: validMessage, conversation_id: null }
검증:
  1. res.status === 200
  2. Content-Type에 'text/event-stream' 포함
  3. SSE 스트림에 텍스트 응답 포함
  4. DB 검증: conversations 테이블에 해당 user_id로 새 레코드 존재
```

**C-05: 기존 대화 계속 → 200 + SSE**

```
사전조건: C-04에서 생성된 conversationId 사용
Mock: text-only
요청: POST /api/chat + 인증 + body: { message: validMessage, conversation_id: conversationId }
검증:
  1. res.status === 200
  2. SSE 스트림 정상 반환
```

**C-06: 타인 대화 접근 차단**

```
사전조건: userA의 conversationId를 userB가 사용
Mock: text-only
요청: POST /api/chat (userB 토큰) + body: { conversation_id: userA_conversationId }
검증: res.status === 500 (service에서 'Conversation not found' throw → route에서 CHAT_LLM_ERROR)
```

**C-07: Tool 실행 (실제 DB) — search_beauty_data**

```
사전조건: DB에 시드 데이터 존재 (describe.skipIf으로 가드)
Mock: multi-step (step 1: search_beauty_data tool call → step 2: text 응답)
요청: POST /api/chat + 인증 + body: validMessage
검증:
  1. res.status === 200
  2. SSE 스트림 소비 → tool-result 이벤트 존재
  3. tool result에 cards 배열 포함 (실제 DB 데이터)
```

**C-08: onFinish — ui_messages DB 저장**

```
Mock: text-only
요청: POST /api/chat + 인증 + body: { message: validMessage, conversation_id: null }
검증:
  1. SSE 스트림 완전 소비 (onFinish 트리거 보장)
  2. 대기 후 DB 검증: conversations.ui_messages에 메시지가 저장됨
  3. 저장된 메시지에 user + assistant 메시지 모두 포함
```

**C-09: LLM 실패 → 500**

```
Mock: callWithFallback가 Error throw하도록 별도 mock
요청: POST /api/chat + 인증 + body: validMessage
검증:
  1. res.status === 500
  2. json.error.code === 'CHAT_LLM_ERROR'
```

**C-10: 프로필 없는 사용자 → 정상 동작**

```
사전조건: users 테이블에만 등록, user_profiles 레코드 없음
Mock: text-only
요청: POST /api/chat + 인증 + body: validMessage
검증:
  1. res.status === 200
  2. SSE 스트림 정상 반환 (profile null이어도 에러 없음)
```

---

## SSE 스트림 소비 방법

```typescript
/** SSE 응답을 텍스트로 소비하여 이벤트 배열로 파싱 */
async function consumeSSE(res: Response): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    // 각 SSE 라인을 이벤트로 분리
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    events.push(...lines);
  }
  
  return events;
}
```

---

## onFinish 대기 방법

`consumeStream()` + `toUIMessageStreamResponse({ onFinish })` 패턴에서, 스트림을 완전히 소비하면 onFinish가 트리거됩니다. 다만 onFinish는 비동기이므로 DB 쓰기 완료까지 짧은 대기가 필요합니다.

```typescript
// 스트림 완전 소비 → onFinish 트리거
await consumeSSE(res);
// onFinish의 비동기 DB 쓰기 완료 대기
await new Promise(resolve => setTimeout(resolve, 1000));
// DB 검증
const verify = createVerifyClient();
const { data } = await verify
  .from('conversations')
  .select('ui_messages')
  .eq('id', conversationId)
  .single();
expect(data.ui_messages).not.toBeNull();
```

**주의:** `setTimeout` 대기는 비결정적이므로, 실패 시 재시도 로직 또는 대기 시간 증가를 고려합니다. 통합 테스트 환경에서 1초는 충분히 보수적입니다 (onFinish는 DB UPDATE 1회).

---

## 독립성 검증

### 비즈니스/코어 코드 영향 분석

| 파일 | 수정 여부 | 역참조 |
|------|----------|--------|
| src/server/core/* | 수정 없음 | vi.mock으로 llm-client만 대체. core/ import 없음 |
| src/server/features/chat/* | 수정 없음 | route/service/tool 코드를 있는 그대로 호출 |
| src/server/features/profile/* | 수정 없음 | route에서 getProfile 호출 (실제 DB 경유) |
| src/server/features/journey/* | 수정 없음 | route에서 getActiveJourney 호출 (실제 DB 경유) |
| src/client/* | 수정 없음 | 참조 없음 |
| src/shared/* | 수정 없음 | 참조 없음 |
| helpers.ts | 수정 없음 | 기존 P2-71 헬퍼 그대로 재사용 |
| vitest.integration.config.ts | 수정 없음 | 기존 설정 그대로 사용 |
| setup.ts | 수정 없음 | server-only mock 그대로 사용 |

### 모듈 삭제 안전성

테스트 파일 삭제 시:
- `npm run build` 정상 (테스트 파일은 빌드 대상 아님)
- `npm test` 정상 (단위 테스트에 영향 없음)
- `npm run test:integration` 정상 (해당 파일만 미실행)
- 다른 테스트 파일에서 import하지 않음 (역참조 0건)

### 재사용성 / 유지보수성

- **Mock 모델 팩토리**: `createTextOnlyMock()`, `createToolCallMock()` 헬퍼를 테스트 파일 내부에 정의. 테스트 케이스별 mock 구성을 간결하게 유지.
- **SSE 파서**: `consumeSSE()` 헬퍼를 파일 내부에 정의. 다른 통합 테스트에서 필요해지면 helpers.ts로 이동 가능.
- **확장성**: 새 tool 추가 시 tool call mock chunk만 추가하면 됨. 테스트 구조 변경 불필요.

---

## Task 1: chat-api.integration.test.ts 작성

**Files:**
- Create: `src/__tests__/integration/chat-api.integration.test.ts`

- [ ] **Step 1: Mock 유틸 + SSE 파서 구현**
  - `createTextOnlyMock()`: text-only 스트림 반환하는 MockLanguageModelV3
  - `createToolCallMock(toolName, args)`: multi-step tool call 스트림 반환
  - `createFailingMock()`: Error throw하는 mock
  - `consumeSSE(res)`: SSE 응답 소비 → 이벤트 배열 파싱

- [ ] **Step 2: 인증 + 입력 검증 테스트 (C-01~C-03)**
  - C-01: 미인증 401
  - C-02: 빈 body 400
  - C-03: 빈 text 400

- [ ] **Step 3: 대화 생성 + 스트리밍 테스트 (C-04~C-06)**
  - C-04: 새 대화 생성 + SSE + DB 검증
  - C-05: 기존 대화 계속
  - C-06: 타인 대화 차단

- [ ] **Step 4: Tool 실행 테스트 (C-07)**
  - search_beauty_data mock tool call → 실제 DB 검색
  - describe.skipIf(!hasSeedData) 가드

- [ ] **Step 5: onFinish 후처리 테스트 (C-08)**
  - 스트림 완전 소비 후 DB에 ui_messages 저장 검증

- [ ] **Step 6: 에러 + 엣지 케이스 테스트 (C-09~C-10)**
  - C-09: LLM 실패 500
  - C-10: 프로필 없는 사용자

- [ ] **Step 7: 로컬 실행 검증**
  - `npm run test:integration -- --testPathPattern chat-api`
  - 전체 통합 테스트 회귀: `npm run test:integration`

- [ ] **Step 8: 커밋**
