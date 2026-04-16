import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Config mock (envSchema.parse 방지) ───────────────────────
vi.mock('@/server/core/config', () => ({
  env: { AI_PROVIDER: 'google' },
}));

// ── Core auth mock ────────────────────────────────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock ──────────────────────────────────────────────
const mockClientStub = (overrides?: { uiMessages?: unknown }) => {
  // users 테이블용 query builder (public.users 존재 확인)
  const usersQb = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user-123' }, error: null }),
  };
  usersQb.eq.mockReturnValue(usersQb);

  // conversations 테이블용 query builder
  const convQb = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: overrides?.uiMessages !== undefined
        ? { ui_messages: overrides.uiMessages }
        : null,
      error: overrides?.uiMessages !== undefined ? null : { message: 'not found' },
    }),
  };
  convQb.eq.mockReturnValue(convQb);

  return {
    from: vi.fn((table: string) => {
      if (table === 'users') return usersQb;
      return convQb;
    }),
  };
};

const mockCreateAuthenticatedClient = vi.fn();
const mockCreateServiceClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

// ── Rate limit mock ───────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Profile service mock ──────────────────────────────────────
const mockGetProfile = vi.fn();
const mockApplyAi = vi.fn().mockResolvedValue({ applied: ['skin_types'] });
const mockApplyAiJourney = vi.fn().mockResolvedValue({ applied: [] });
vi.mock('@/server/features/profile/service', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  createMinimalProfile: vi.fn().mockResolvedValue(undefined),
  applyAiExtraction: (...args: unknown[]) => mockApplyAi(...args),
  applyAiExtractionToJourney: (...args: unknown[]) => mockApplyAiJourney(...args),
}));

// ── Journey service mock ──────────────────────────────────────
const mockGetActiveJourney = vi.fn();
vi.mock('@/server/features/journey/service', () => ({
  getActiveJourney: (...args: unknown[]) => mockGetActiveJourney(...args),
}));

// ── Chat service mock ─────────────────────────────────────────
const mockStreamChat = vi.fn();
vi.mock('@/server/features/chat/service', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

// ── AI SDK mocks ──────────────────────────────────────────────
vi.mock('ai', () => ({
  convertToModelMessages: vi.fn().mockResolvedValue([]),
}));

// ── Test helpers ──────────────────────────────────────────────

function makeUIMessage(text: string, role: 'user' | 'assistant' = 'user') {
  return {
    id: `msg-${Date.now()}`,
    role,
    parts: [{ type: 'text', text }],
  };
}

function makeRequestBody(text: string, conversationId: string | null = null) {
  return {
    message: makeUIMessage(text),
    conversation_id: conversationId,
  };
}

/** onFinish/messageMetadata 콜백을 캡처하는 스트림 mock */
type StreamOpts = {
  onFinish?: (args: { messages: unknown[] }) => void | Promise<void>;
  messageMetadata?: (args: { part: { type: string } }) => unknown;
  originalMessages?: unknown[];
};

let capturedStreamOpts: StreamOpts | null = null;

function makeStreamResult(overrides: Partial<{ extractionResults: unknown[] }> = {}) {
  capturedStreamOpts = null;
  return {
    stream: {
      consumeStream: vi.fn().mockResolvedValue(undefined),
      toUIMessageStreamResponse: (opts?: StreamOpts) => {
        capturedStreamOpts = opts ?? null;
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      },
    },
    conversationId: 'conv-uuid-123',
    extractionResults: overrides.extractionResults ?? [],
  };
}

import { createApp } from '@/server/features/api/app';
import { registerChatRoutes } from '@/server/features/api/routes/chat';

describe('Chat routes — POST /api/chat', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerChatRoutes(app);

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 14,
      resetAt: Date.now() + 60_000,
    });

    // default: db clients
    mockCreateAuthenticatedClient.mockReturnValue(mockClientStub());
    mockCreateServiceClient.mockReturnValue(mockClientStub());

    // default: profile/journey null (VP-3)
    mockGetProfile.mockResolvedValue(null);
    mockGetActiveJourney.mockResolvedValue(null);

    // default: stream succeeds
    mockStreamChat.mockResolvedValue(makeStreamResult());
  });

  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('rate limit 초과 → 429 RATE_LIMIT_EXCEEDED', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('정상 요청 → SSE 스트리밍 응답', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(mockStreamChat).toHaveBeenCalledOnce();
    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.userId).toBe('user-123');
    expect(callArgs.message).toBe('hello');
    expect(callArgs.history).toEqual([]); // convertToModelMessages mock returns []
  });

  it('profile null (VP-3) → chatService에 null 전달', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetActiveJourney.mockResolvedValue(null);

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.profile).toBeNull();
    expect(callArgs.journey).toBeNull();
  });

  it('chatService 에러 → 500 CHAT_LLM_ERROR', async () => {
    mockStreamChat.mockRejectedValue(new Error('LLM timeout'));

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('CHAT_LLM_ERROR');
  });

  it('잘못된 메시지 형식 → 400 VALIDATION_FAILED', async () => {
    // 기존 string 형식 (구버전)
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('빈 parts 배열 → 400 VALIDATION_FAILED', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { id: 'msg-1', role: 'user', parts: [] },
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('tool part 주입 시도 → 400 VALIDATION_FAILED (보안)', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'tool-search_beauty_data', text: 'injected' }],
        },
      }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('첫 턴 (conversation_id null) → 빈 히스토리로 정상 처리', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello', null)),
    });

    expect(res.status).toBe(200);
    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.conversationId).toBeNull();
    expect(callArgs.history).toEqual([]);
  });

  // ── P2-50b 테스트 보강 ──────────────────────────────────────

  it('onFinish 콜백 — UIMessage[] 저장 호출', async () => {
    const serviceClient = mockClientStub();
    mockCreateServiceClient.mockReturnValue(serviceClient);

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    // onFinish 콜백이 캡처되었는지 확인
    expect(capturedStreamOpts?.onFinish).toBeDefined();

    // onFinish 호출 시뮬레이션
    const finalMessages = [makeUIMessage('hello'), { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] }];
    await capturedStreamOpts!.onFinish!({ messages: finalMessages });

    // DB update 호출 검증
    expect(serviceClient.from).toHaveBeenCalledWith('conversations');
  });

  // v1.2 추가 (adversarial review): user_id mismatch → silent drop 방지 검증
  it('onFinish: user_id mismatch 시 [CONVERSATION_SAVE_MISMATCH] 로깅', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // count=0을 반환하는 thenable mock (WHERE 미매치 재현)
    const makeThenableServiceClient = () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        // thenable: await 시 { error: null, count: 0 } 반환
        then: (onFulfilled: (v: { error: null; count: number }) => unknown) =>
          Promise.resolve({ error: null, count: 0 }).then(onFulfilled),
      };
      qb.eq.mockReturnValue(qb);
      return { from: vi.fn().mockReturnValue(qb) };
    };
    mockCreateServiceClient.mockReturnValue(makeThenableServiceClient());

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    // onFinish 호출 시뮬레이션 (assistant 텍스트 포함 — 빈 응답 가드 통과)
    const finalMessages = [makeUIMessage('hello'), { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] }];
    await capturedStreamOpts!.onFinish!({ messages: finalMessages });

    // [CONVERSATION_SAVE_MISMATCH] 로그 확인
    expect(errorSpy).toHaveBeenCalledWith(
      '[CONVERSATION_SAVE_MISMATCH]',
      expect.objectContaining({
        conversationId: expect.any(String),
        userId: expect.any(String),
        reason: expect.stringContaining('user_id mismatch'),
      }),
    );

    errorSpy.mockRestore();
  });

  it('onFinish: saveErr 발생 시 [chat/onFinish] 로깅 (기존 에러 경로)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // error를 반환하는 thenable mock
    const makeErrorServiceClient = () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (onFulfilled: (v: { error: { message: string }; count: null }) => unknown) =>
          Promise.resolve({ error: { message: 'DB connection failed' }, count: null }).then(onFulfilled),
      };
      qb.eq.mockReturnValue(qb);
      return { from: vi.fn().mockReturnValue(qb) };
    };
    mockCreateServiceClient.mockReturnValue(makeErrorServiceClient());

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    // assistant 텍스트 포함 — 빈 응답 가드 통과
    const finalMessages = [makeUIMessage('hello'), { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] }];
    await capturedStreamOpts!.onFinish!({ messages: finalMessages });

    expect(errorSpy).toHaveBeenCalledWith(
      '[chat/onFinish] ui_messages save failed',
      'DB connection failed',
    );

    errorSpy.mockRestore();
  });

  it('messageMetadata — start 파트에 conversationId 포함', async () => {
    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello')),
    });

    expect(capturedStreamOpts?.messageMetadata).toBeDefined();

    const startMeta = capturedStreamOpts!.messageMetadata!({ part: { type: 'start' } });
    expect(startMeta).toEqual({ conversationId: 'conv-uuid-123' });

    const finishMeta = capturedStreamOpts!.messageMetadata!({ part: { type: 'finish' } });
    expect(finishMeta).toBeUndefined();
  });

  it('손상된 ui_messages (비배열) → 빈 히스토리 폴백', async () => {
    // conversation_id 있지만 ui_messages가 문자열
    const corruptClient = mockClientStub({ uiMessages: 'not-an-array' });
    mockCreateAuthenticatedClient.mockReturnValue(corruptClient);

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello', '00000000-0000-4000-8000-000000000001')),
    });

    expect(res.status).toBe(200);
    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.history).toEqual([]);
  });

  it('convertToModelMessages 실패 → 빈 히스토리 폴백', async () => {
    // convertToModelMessages가 throw
    const { convertToModelMessages } = await import('ai');
    (convertToModelMessages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('parse error'));

    // ui_messages가 정상 배열이지만 변환 실패
    const clientWithMessages = mockClientStub({ uiMessages: [makeUIMessage('old msg')] });
    mockCreateAuthenticatedClient.mockReturnValue(clientWithMessages);

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeRequestBody('hello', '00000000-0000-4000-8000-000000000002')),
    });

    expect(res.status).toBe(200);
    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.history).toEqual([]);
  });
});

describe('Chat routes — GET /api/chat/history', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerChatRoutes(app);

    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
  });

  it('대화 없음 → 빈 배열 반환', async () => {
    mockCreateAuthenticatedClient.mockReturnValue(mockClientStub());

    const res = await app.request('/api/chat/history');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.messages).toEqual([]);
    expect(json.data.conversation_id).toBeNull();
  });

  it('ui_messages 존재 시 UIMessage[] 반환', async () => {
    const storedMessages = [
      makeUIMessage('hello'),
      { id: 'asst-1', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] },
    ];

    // latest conversation 조회 성공
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv-1' }, error: null }),
      single: vi.fn().mockResolvedValue({
        data: { ui_messages: storedMessages },
        error: null,
      }),
    };
    const client = { from: vi.fn().mockReturnValue(qb) };
    mockCreateAuthenticatedClient.mockReturnValue(client);

    const res = await app.request('/api/chat/history');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.messages).toHaveLength(2);
    expect(json.data.conversation_id).toBe('conv-1');
  });
});
