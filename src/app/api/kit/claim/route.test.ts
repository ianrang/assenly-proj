import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
}));

// db mock
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: () => ({
    from: (table: string) => {
      if (table === 'kit_subscribers') {
        return { insert: mockInsert };
      }
      if (table === 'consent_records') {
        return { update: mockUpdate };
      }
      return {};
    },
  }),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// crypto mock
const mockEncrypt = vi.fn();
const mockHash = vi.fn();
vi.mock('@/server/core/crypto', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  hash: (...args: unknown[]) => mockHash(...args),
}));

const validBody = {
  email: 'test@example.com',
  marketing_consent: true,
};

function createRequest(body: unknown) {
  return new Request('http://localhost/api/kit/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/kit/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockEncrypt.mockReturnValue('encrypted-email');
    mockHash.mockReturnValue('hashed-email');
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('인증 실패 → 401', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('rate limit 초과 → 429 + Retry-After', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt });

    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('marketing_consent 누락 → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest({ email: 'test@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('잘못된 이메일 → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest({ email: 'not-an-email', marketing_consent: true }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('정상 요청 → 201 claimed + encrypt/hash 호출', async () => {
    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('claimed');
    expect(mockEncrypt).toHaveBeenCalledWith('test@example.com');
    expect(mockHash).toHaveBeenCalledWith('test@example.com');
  });

  it('중복 이메일 (23505) → 409 KIT_ALREADY_CLAIMED', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe('KIT_ALREADY_CLAIMED');
  });

  it('marketing_consent true → consent_records UPDATE 호출', async () => {
    const { POST } = await import('@/app/api/kit/claim/route');
    await POST(createRequest({ email: 'test@example.com', marketing_consent: true }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ marketing: true }),
    );
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('DB 에러 → 500 KIT_CLAIM_FAILED', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42P01', message: 'table not found' } });

    const { POST } = await import('@/app/api/kit/claim/route');
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('KIT_CLAIM_FAILED');
  });
});
