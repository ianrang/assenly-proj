import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Rate limit mock ──────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Auth service mock ────────────────────────────────────────
const mockRegisterAnonymousUser = vi.fn();
vi.mock('@/server/features/auth/service', () => ({
  registerAnonymousUser: (...args: unknown[]) => mockRegisterAnonymousUser(...args),
}));

// ── Core auth mock (requireAuth middleware) ──────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
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

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 2,
      resetAt: Date.now() + 60_000,
    });

    // default: registration succeeds
    mockRegisterAnonymousUser.mockResolvedValue({
      user_id: 'user-123',
    });
  });

  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
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

    expect(res.status).toBe(400);
  });

  it('정상 요청 → 201 + data.user_id + meta.timestamp', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({ user_id: 'user-123' });
    expect(json.meta.timestamp).toBeDefined();
    // registerAnonymousUser에 userId 전달 확인
    expect(mockRegisterAnonymousUser).toHaveBeenCalledWith('user-123', { data_retention: true });
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
    mockRegisterAnonymousUser.mockRejectedValue(new Error('DB connection failed'));

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
