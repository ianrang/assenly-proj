import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Rate limit mock ──────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Auth service mock ────────────────────────────────────────
const mockCreateAnonymousSession = vi.fn();
vi.mock('@/server/features/auth/service', () => ({
  createAnonymousSession: (...args: unknown[]) => mockCreateAnonymousSession(...args),
}));

// ── Core auth mock (optionalAuthenticateUser for middleware) ─
vi.mock('@/server/core/auth', () => ({
  authenticateUser: vi.fn().mockRejectedValue(new Error('unused in this route')),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock ─────────────────────────────────────────────
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: vi.fn().mockReturnValue({}),
  createServiceClient: vi.fn().mockReturnValue({}),
}));

import { createApp } from '@/server/features/api/app';
import { registerAuthRoutes } from '@/server/features/api/routes/auth';

describe('POST /api/auth/anonymous', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerAuthRoutes(app);

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 2,
      resetAt: Date.now() + 60_000,
    });

    // default: session creation succeeds
    mockCreateAnonymousSession.mockResolvedValue({
      user_id: 'user-uuid-123',
      session_token: 'token-abc',
    });
  });

  it('rate limit 초과 → 429 RATE_LIMIT_EXCEEDED', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details).toHaveProperty('retryAfter');
  });

  it('검증 실패: consent 누락 → 400', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
  });

  it('정상 요청 → 201 + data + meta.timestamp', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({ user_id: 'user-uuid-123', session_token: 'token-abc' });
    expect(json.meta.timestamp).toBeDefined();
  });

  it('data_retention=false → 400 (검증 실패)', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: false } }),
    });

    expect(res.status).toBe(400);
  });

  it('서비스 에러 → 500 AUTH_SESSION_CREATION_FAILED (내부 메시지 미노출)', async () => {
    mockCreateAnonymousSession.mockRejectedValue(new Error('DB connection failed'));

    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('AUTH_SESSION_CREATION_FAILED');
    expect(json.error.message).toBe('Failed to create session');
    expect(json.error.message).not.toContain('DB connection');
  });
});
