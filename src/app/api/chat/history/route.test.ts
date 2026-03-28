import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
}));

// db mock
const mockCreateAuthenticatedClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// memory mock
const mockLoadRecentMessages = vi.fn();
vi.mock('@/server/core/memory', () => ({
  loadRecentMessages: (...args: unknown[]) => mockLoadRecentMessages(...args),
}));

// --- helpers ---

function createRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/chat/history');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new Request(url.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

/** Supabase client stub for conversations query */
function makeClientStub(conversationData: { id: string } | null = { id: 'conv-uuid-123' }) {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: conversationData, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(queryBuilder),
  };
}

/** Sample messages returned by loadRecentMessages (includes tool_calls) */
const SAMPLE_MESSAGES = [
  {
    role: 'user',
    content: 'hello',
    card_data: null,
    tool_calls: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    role: 'assistant',
    content: 'Hi there!',
    card_data: { type: 'product' },
    tool_calls: [{ id: 'call-1', name: 'search' }],
    created_at: '2024-01-01T00:00:01Z',
  },
];

describe('GET /api/chat/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit passes
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });

    // default: client stub with a conversation
    mockCreateAuthenticatedClient.mockReturnValue(makeClientStub());

    // default: loadRecentMessages returns sample messages
    mockLoadRecentMessages.mockResolvedValue(SAMPLE_MESSAGES);
  });

  // 1. Auth failure → 401 AUTH_REQUIRED
  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  // 2. Rate limit exceeded → 429 RATE_LIMIT_EXCEEDED
  it('rate limit 초과 → 429 RATE_LIMIT_EXCEEDED + Retry-After', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt });

    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  // 3. Invalid conversation_id → 400 VALIDATION_FAILED
  it('잘못된 conversation_id → 400 VALIDATION_FAILED', async () => {
    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest({ conversation_id: 'not-a-uuid' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  // 4. Normal request with conversation_id → messages returned (without tool_calls)
  it('정상 요청 (conversation_id 있음) → messages 반환, tool_calls 미포함', async () => {
    const conversationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest({ conversation_id: conversationId }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe(conversationId);
    expect(json.data.messages).toHaveLength(2);

    // tool_calls must NOT be present in any message
    for (const msg of json.data.messages as Record<string, unknown>[]) {
      expect(msg).not.toHaveProperty('tool_calls');
      expect(msg).toHaveProperty('role');
      expect(msg).toHaveProperty('content');
      expect(msg).toHaveProperty('card_data');
      expect(msg).toHaveProperty('created_at');
    }

    expect(mockLoadRecentMessages).toHaveBeenCalledWith(
      expect.anything(),
      conversationId,
      20, // TOKEN_CONFIG.default.historyLimit
    );
  });

  // 5. No conversation_id → latest conversation auto-queried
  it('conversation_id 없음 → 최신 대화 자동 조회', async () => {
    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe('conv-uuid-123');
    expect(json.data.messages).toHaveLength(2);
    expect(mockLoadRecentMessages).toHaveBeenCalledWith(
      expect.anything(),
      'conv-uuid-123',
      20,
    );
  });

  // 6. No conversation exists → empty array + null conversation_id
  it('대화 없음 → 빈 배열 + conversation_id null', async () => {
    mockCreateAuthenticatedClient.mockReturnValue(makeClientStub(null));

    const { GET } = await import('@/app/api/chat/history/route');
    const res = await GET(createRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.messages).toEqual([]);
    expect(json.data.conversation_id).toBeNull();
    expect(mockLoadRecentMessages).not.toHaveBeenCalled();
  });
});
