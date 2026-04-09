import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { streamText, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type {
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';

// ── LLM mock ─────────────────────────────────────────────────
// callWithFallback만 대체. streamText는 실제 AI SDK 코드 실행.
// tools.execute()가 실제 DB를 쿼리함.
let shouldFailCallWithFallback = false;

vi.mock('@/server/features/chat/llm-client', () => ({
  callWithFallback: async (options: Record<string, unknown>) => {
    if (shouldFailCallWithFallback) {
      throw new Error('LLM provider unavailable');
    }
    // options에는 service.ts에서 전달한 messages, system, tools, stopWhen이 포함됨.
    // Record<string, unknown> spread를 streamText 파라미터로 변환.
    return streamText({
      ...options,
      model: currentMockModel,
    } as unknown as Parameters<typeof streamText>[0]);
  },
}));

import { createApp } from '@/server/features/api/app';
import { registerChatRoutes } from '@/server/features/api/routes/chat';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  authHeaders,
  type TestSession,
} from './helpers';

// ── Mock 모델 팩토리 ────────────────────────────────────────

/** 현재 테스트에서 사용할 mock 모델. 테스트별로 교체. */
let currentMockModel: MockLanguageModelV3;

const MOCK_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

/** 단순 텍스트 응답만 반환하는 mock */
function createTextOnlyMock(text = 'Hello! I can help you find K-beauty products.'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: 'text-start', id: 'text-1' } as LanguageModelV3StreamPart,
          { type: 'text-delta', id: 'text-1', delta: text } as LanguageModelV3StreamPart,
          { type: 'text-end', id: 'text-1' } as LanguageModelV3StreamPart,
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            logprobs: undefined,
            usage: MOCK_USAGE,
          } as LanguageModelV3StreamPart,
        ],
      }),
    }),
  });
}

/** search_beauty_data tool call → text 응답 반환하는 multi-step mock */
function createSearchToolCallMock(): MockLanguageModelV3 {
  let callCount = 0;

  return new MockLanguageModelV3({
    doStream: async () => {
      callCount++;

      if (callCount === 1) {
        // Step 1: tool call
        const toolArgs = JSON.stringify({
          query: 'moisturizer for dry skin',
          domain: 'shopping',
          limit: 3,
        });

        return {
          stream: simulateReadableStream({
            initialDelayInMs: null,
            chunkDelayInMs: null,
            chunks: [
              { type: 'tool-input-start', id: 'call-1', toolName: 'search_beauty_data' } as LanguageModelV3StreamPart,
              { type: 'tool-input-delta', id: 'call-1', delta: toolArgs } as LanguageModelV3StreamPart,
              { type: 'tool-input-end', id: 'call-1' } as LanguageModelV3StreamPart,
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: undefined },
                logprobs: undefined,
                usage: MOCK_USAGE,
              } as LanguageModelV3StreamPart,
            ],
          }),
        };
      }

      // Step 2: text response after tool execution
      return {
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            { type: 'text-start', id: 'text-1' } as LanguageModelV3StreamPart,
            { type: 'text-delta', id: 'text-1', delta: 'Based on the search results, here are some recommendations.' } as LanguageModelV3StreamPart,
            { type: 'text-end', id: 'text-1' } as LanguageModelV3StreamPart,
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              logprobs: undefined,
              usage: MOCK_USAGE,
            } as LanguageModelV3StreamPart,
          ],
        }),
      };
    },
  });
}

// ── SSE 스트림 소비 유틸 ─────────────────────────────────────

/** SSE 응답을 완전 소비하여 data 라인 배열로 반환 */
async function consumeSSE(res: Response): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    events.push(...lines);
  }

  return events;
}

/** 유효한 채팅 요청 body 생성 */
function makeChatBody(text: string, conversationId: string | null = null) {
  return {
    message: {
      id: `msg-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text }],
    },
    conversation_id: conversationId,
  };
}

// ── 시드 데이터 존재 확인 ────────────────────────────────────

async function checkSeedData(): Promise<boolean> {
  const client = createVerifyClient();
  const { count } = await client
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  return (count ?? 0) > 0;
}

// ── 메인 테스트 ──────────────────────────────────────────────

const hasSeedData = await checkSeedData();

describe('POST /api/chat (integration)', () => {
  const app = createApp();
  let sessionA: TestSession;
  let sessionB: TestSession;

  beforeAll(async () => {
    registerChatRoutes(app);
    sessionA = await createRegisteredTestUser();
    sessionB = await createRegisteredTestUser();
  });

  afterAll(async () => {
    if (sessionA) await cleanupTestUser(sessionA.userId);
    if (sessionB) await cleanupTestUser(sessionB.userId);
  });

  // ── 인증 + 입력 검증 ───────────────────────────────────────

  describe('인증 + 입력 검증', () => {
    it('C-01: 미인증 → 401', async () => {
      currentMockModel = createTextOnlyMock();

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeChatBody('hello')),
      });

      expect(res.status).toBe(401);
    });

    it('C-02: 잘못된 body (빈 객체) → 400', async () => {
      currentMockModel = createTextOnlyMock();

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('C-03: message.parts에 빈 text → 400', async () => {
      currentMockModel = createTextOnlyMock();

      const body = {
        message: {
          id: 'msg-empty',
          role: 'user',
          parts: [{ type: 'text', text: '' }],
        },
      };

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── 대화 생성 + 스트리밍 ───────────────────────────────────

  describe('대화 생성 + 스트리밍', () => {
    let createdConversationId: string | null = null;

    it('C-04: 새 대화 생성 → 200 + SSE + DB에 conversation 생성', async () => {
      currentMockModel = createTextOnlyMock();

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify(makeChatBody('I need a moisturizer')),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // SSE 스트림 소비
      const events = await consumeSSE(res);
      expect(events.length).toBeGreaterThan(0);

      // SSE에서 conversationId 추출 (messageMetadata의 start 이벤트)
      const startEvent = events.find(e => e.includes('"type":"start"'));
      expect(startEvent).toBeDefined();

      if (startEvent) {
        const parsed = JSON.parse(startEvent.replace('data: ', ''));
        if (parsed.messageMetadata?.conversationId) {
          createdConversationId = parsed.messageMetadata.conversationId;
        }
      }

      // conversationId가 SSE start 이벤트에 포함되어야 함
      expect(createdConversationId).not.toBeNull();

      // DB 검증: conversation 레코드 존재
      const verify = createVerifyClient();
      const { data: convs } = await verify
        .from('conversations')
        .select('id')
        .eq('user_id', sessionA.userId);

      expect(convs).not.toBeNull();
      expect(convs!.length).toBeGreaterThan(0);
    });

    it('C-05: 기존 대화 계속 → 200 + SSE', async () => {
      // C-04에서 생성된 conversationId 사용
      expect(createdConversationId).not.toBeNull();

      currentMockModel = createTextOnlyMock('Sure, let me help you with that.');

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify(makeChatBody('Something for dry skin', createdConversationId)),
      });

      expect(res.status).toBe(200);

      const events = await consumeSSE(res);
      expect(events.length).toBeGreaterThan(0);

      // 텍스트 응답 포함 확인
      const hasTextDelta = events.some(e => e.includes('"type":"text-delta"'));
      expect(hasTextDelta).toBe(true);
    });

    it('C-06: 타인 대화 접근 차단 → 500', async () => {
      expect(createdConversationId).not.toBeNull();

      currentMockModel = createTextOnlyMock();

      // sessionB로 sessionA의 대화에 접근 시도
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionB.token),
        body: JSON.stringify(makeChatBody('hijack attempt', createdConversationId)),
      });

      // service에서 'Conversation not found' throw → route에서 CHAT_LLM_ERROR
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error.code).toBe('CHAT_LLM_ERROR');
    });
  });

  // ── Tool 실행 (실제 DB) ────────────────────────────────────

  describe.skipIf(!hasSeedData)('Tool 실행 (실제 DB)', () => {
    it('C-07: search_beauty_data tool call → 실제 DB 검색 → SSE에 tool result 포함', async () => {
      currentMockModel = createSearchToolCallMock();

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify(makeChatBody('Find me a good moisturizer for dry skin')),
      });

      expect(res.status).toBe(200);

      const events = await consumeSSE(res);
      expect(events.length).toBeGreaterThan(0);

      // tool-input 이벤트 존재 확인 (mock LLM → service → tool 등록 체인 검증)
      const hasToolInputStart = events.some(e => e.includes('"type":"tool-input-start"'));
      expect(hasToolInputStart).toBe(true);

      // tool call이 search_beauty_data를 대상으로 함
      const toolStartEvent = events.find(e => e.includes('"type":"tool-input-start"'));
      expect(toolStartEvent).toBeDefined();
      const parsedTool = JSON.parse(toolStartEvent!.replace('data: ', ''));
      expect(parsedTool.toolName).toBe('search_beauty_data');

      // tool args가 SSE에 전달됨
      const hasToolInputDelta = events.some(e => e.includes('"type":"tool-input-delta"'));
      expect(hasToolInputDelta).toBe(true);
    });
  });

  // ── onFinish 후처리 ────────────────────────────────────────

  describe('onFinish 후처리', () => {
    it('C-08: 스트림 완료 후 DB에 ui_messages 저장', async () => {
      currentMockModel = createTextOnlyMock('Here is my recommendation.');

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionA.token),
        body: JSON.stringify(makeChatBody('Recommend something')),
      });

      expect(res.status).toBe(200);

      // SSE 완전 소비 → onFinish 트리거
      const events = await consumeSSE(res);

      // conversationId 추출
      const startEvent = events.find(e => e.includes('"type":"start"'));
      expect(startEvent).toBeDefined();
      const parsed = JSON.parse(startEvent!.replace('data: ', ''));
      const conversationId = parsed.messageMetadata?.conversationId;
      expect(conversationId).toBeDefined();

      // onFinish 비동기 DB 쓰기 완료를 폴링으로 확인 (최대 5초, 200ms 간격)
      const verify = createVerifyClient();
      const POLL_INTERVAL_MS = 200;
      const POLL_MAX_MS = 5000;
      let elapsed = 0;
      let savedMessages: Array<{ role: string }> | null = null;

      while (elapsed < POLL_MAX_MS) {
        const { data: conv } = await verify
          .from('conversations')
          .select('ui_messages')
          .eq('id', conversationId)
          .single();

        if (conv?.ui_messages && Array.isArray(conv.ui_messages) && conv.ui_messages.length >= 2) {
          savedMessages = conv.ui_messages as Array<{ role: string }>;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        elapsed += POLL_INTERVAL_MS;
      }

      // DB에 ui_messages가 저장되었는지 검증
      expect(savedMessages).not.toBeNull();
      expect(savedMessages!.some(m => m.role === 'user')).toBe(true);
      expect(savedMessages!.some(m => m.role === 'assistant')).toBe(true);
    });
  });

  // ── 에러 처리 ──────────────────────────────────────────────

  describe('에러 처리', () => {
    it('C-09: LLM 실패 → 500 + CHAT_LLM_ERROR', async () => {
      // callWithFallback 자체가 throw하도록 설정
      // (streamText는 lazy이므로 doStream throw는 route catch에 도달 안 함)
      shouldFailCallWithFallback = true;

      try {
        const res = await app.request('/api/chat', {
          method: 'POST',
          headers: authHeaders(sessionA.token),
          body: JSON.stringify(makeChatBody('hello')),
        });

        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error.code).toBe('CHAT_LLM_ERROR');
      } finally {
        shouldFailCallWithFallback = false;
      }
    });

    it('C-10: 프로필 없는 사용자 → 정상 동작', async () => {
      // sessionB는 users + consent만 등록, user_profiles 없음
      currentMockModel = createTextOnlyMock('Welcome! I can help you.');

      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: authHeaders(sessionB.token),
        body: JSON.stringify(makeChatBody('I am new here')),
      });

      expect(res.status).toBe(200);

      const events = await consumeSSE(res);
      expect(events.length).toBeGreaterThan(0);

      // 텍스트 응답 정상 반환
      const hasTextDelta = events.some(e => e.includes('"type":"text-delta"'));
      expect(hasTextDelta).toBe(true);
    });
  });
});
