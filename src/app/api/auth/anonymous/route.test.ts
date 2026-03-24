import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// auth service mock
const mockCreateAnonymousSession = vi.fn();
vi.mock('@/server/features/auth/service', () => ({
  createAnonymousSession: (...args: unknown[]) =>
    mockCreateAnonymousSession(...args),
}));

describe('POST /api/auth/anonymous', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: rate limit 허용
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 2,
      resetAt: Date.now() + 60000,
    });
  });

  function createRequest(body: unknown) {
    return new Request('http://localhost/api/auth/anonymous', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.1',
      },
      body: JSON.stringify(body),
    });
  }

  it('정상: 201 + data + meta.timestamp + X-RateLimit-* 헤더', async () => {
    mockCreateAnonymousSession.mockResolvedValue({
      user_id: 'user-uuid-123',
      session_token: 'token-abc',
    });

    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(createRequest({ consent: { data_retention: true } }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({
      user_id: 'user-uuid-123',
      session_token: 'token-abc',
    });
    expect(json.meta).toBeDefined();
    expect(json.meta.timestamp).toBeDefined();

    // X-RateLimit-* 헤더 확인
    expect(res.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('검증 실패: consent 누락 -> 400 + 에러 구조', async () => {
    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(createRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(json.error.message).toBeDefined();
    expect(json.error).toHaveProperty('details');
  });

  it('검증 실패: data_retention=false -> 400', async () => {
    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(
      createRequest({ consent: { data_retention: false } }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('Rate limit 초과 -> 429 + Retry-After 헤더', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt,
    });

    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(createRequest({ consent: { data_retention: true } }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details).toHaveProperty('retryAfter');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('서비스 에러 -> 500 + 내부 메시지 노출 금지', async () => {
    mockCreateAnonymousSession.mockRejectedValue(
      new Error('Anonymous sign-in failed'),
    );

    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(createRequest({ consent: { data_retention: true } }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('AUTH_SESSION_CREATION_FAILED');
    expect(json.error.message).toBe('Failed to create session');
    expect(json.error).toHaveProperty('details');
  });

  it('정상 응답 헤더: X-RateLimit-* 모든 응답에 포함', async () => {
    mockCreateAnonymousSession.mockResolvedValue({
      user_id: 'user-uuid-123',
      session_token: 'token-abc',
    });

    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(createRequest({ consent: { data_retention: true } }));

    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('비JSON 요청 -> 400', async () => {
    const req = new Request('http://localhost/api/auth/anonymous', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.1' },
      body: 'not json',
    });

    const { POST } = await import(
      '@/app/api/auth/anonymous/route'
    );
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });
});
