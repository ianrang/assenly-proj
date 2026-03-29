import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Core auth mock ────────────────────────────────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock ──────────────────────────────────────────────
const mockClientStub = () => {
  const qb = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  qb.eq.mockResolvedValue({ data: [], error: null });
  return { from: vi.fn().mockReturnValue(qb) };
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
vi.mock('@/server/features/profile/service', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
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

// ── Memory mock ───────────────────────────────────────────────
vi.mock('@/server/core/memory', () => ({
  loadRecentMessages: vi.fn().mockResolvedValue([]),
}));

function makeStreamResult(overrides: Partial<{ extractionResults: unknown[] }> = {}) {
  return {
    stream: {
      toUIMessageStreamResponse: () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    },
    conversationId: 'conv-uuid-123',
    extractionResults: overrides.extractionResults ?? [],
  };
}

import { createApp } from '@/server/features/api/app';
import { registerChatRoutes } from '@/server/features/api/routes/chat';

describe('Chat routes', () => {
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
      remaining: 4,
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
      body: JSON.stringify({ message: 'hello' }),
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
      body: JSON.stringify({ message: 'hello' }),
    });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('정상 요청 → SSE 스트리밍 응답 (text/event-stream)', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello', conversation_id: null }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(mockStreamChat).toHaveBeenCalledOnce();
    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.userId).toBe('user-123');
    expect(callArgs.message).toBe('hello');
  });

  it('profile null (VP-3) → chatService에 null 전달', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetActiveJourney.mockResolvedValue(null);

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
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
      body: JSON.stringify({ message: 'hello' }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('CHAT_LLM_ERROR');
  });
});
