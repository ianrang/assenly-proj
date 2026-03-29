import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Core auth mock ────────────────────────────────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock ──────────────────────────────────────────────
const mockInsert = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: vi.fn().mockReturnValue({
    from: () => ({ insert: mockInsert }),
  }),
  createServiceClient: vi.fn().mockReturnValue({}),
}));

// ── Rate limit mock ───────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { createApp } from '@/server/features/api/app';
import { registerEventRoutes } from '@/server/features/api/routes/events';

const TEST_ENTITY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TEST_CONV_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const VALID_CARD_CLICK_BODY = {
  events: [
    {
      event_type: 'card_click',
      target_id: TEST_ENTITY_ID,
      target_type: 'product',
      metadata: {
        card_id: `product_${TEST_ENTITY_ID}`,
        domain: 'shopping',
        conversation_id: TEST_CONV_ID,
      },
    },
  ],
};

describe('POST /api/events', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerEventRoutes(app);

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });

    // default: insert succeeds
    mockInsert.mockResolvedValue({ error: null });
  });

  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CARD_CLICK_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('빈 events 배열 → 400 (min 1 검증)', async () => {
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    });

    expect(res.status).toBe(400);
  });

  it('정상 card_click 이벤트 → 200 { recorded: 1 }', async () => {
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CARD_CLICK_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-123',
          event_type: 'card_click',
        }),
      ]),
    );
  });

  it('잘못된 metadata → 해당 이벤트 스킵 (나머지만 기록)', async () => {
    const body = {
      events: [
        // invalid: domain 누락
        {
          event_type: 'card_click',
          target_id: TEST_ENTITY_ID,
          target_type: 'product',
          metadata: {
            card_id: 'product_001',
            // domain 필드 없음 → 스킵
            conversation_id: TEST_CONV_ID,
          },
        },
        // valid
        {
          event_type: 'path_a_entry',
          metadata: { source: 'landing' },
        },
      ],
    };

    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);
  });

  it('DB INSERT 에러 → 200 { recorded: 0 } (Q-15 fire-and-forget)', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42P01', message: 'table not found' } });

    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_CARD_CLICK_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(0);
  });
});
