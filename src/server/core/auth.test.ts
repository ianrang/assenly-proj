import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// config mock
vi.mock('@/server/core/config', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

// Supabase createClient mock
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

function createMockRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers['Authorization'] = token;
  }
  return new Request('http://localhost/api/test', { headers });
}

describe('authenticateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('정상: Bearer 토큰 -> { id, token } 반환', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-123' } },
      error: null,
    });

    const { authenticateUser } = await import('@/server/core/auth');
    const result = await authenticateUser(
      createMockRequest('Bearer valid-token'),
    );

    expect(result).toEqual({ id: 'user-uuid-123', token: 'valid-token' });
    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
  });

  it('Authorization 헤더 없음 -> throw', async () => {
    const { authenticateUser } = await import('@/server/core/auth');

    await expect(authenticateUser(createMockRequest())).rejects.toThrow(
      'Authorization header is required',
    );
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('Bearer 접두사 없음 -> throw', async () => {
    const { authenticateUser } = await import('@/server/core/auth');

    await expect(
      authenticateUser(createMockRequest('Basic some-token')),
    ).rejects.toThrow('Bearer token is required');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('토큰이 빈 문자열 -> throw', async () => {
    const { authenticateUser } = await import('@/server/core/auth');

    await expect(
      authenticateUser(createMockRequest('Bearer ')),
    ).rejects.toThrow('Bearer token is required');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('Supabase getUser 실패 (만료/무효) -> throw', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired' },
    });

    const { authenticateUser } = await import('@/server/core/auth');

    await expect(
      authenticateUser(createMockRequest('Bearer expired-token')),
    ).rejects.toThrow('Invalid or expired token');

    // 내부 메시지 노출 금지
    try {
      await authenticateUser(createMockRequest('Bearer expired-token'));
    } catch (e) {
      expect((e as Error).message).not.toContain('Token expired');
    }
  });
});

describe('optionalAuthenticateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('정상: 토큰 있음 -> { id, token } 반환', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid-456' } },
      error: null,
    });

    const { optionalAuthenticateUser } = await import('@/server/core/auth');
    const result = await optionalAuthenticateUser(
      createMockRequest('Bearer valid-token'),
    );

    expect(result).toEqual({ id: 'user-uuid-456', token: 'valid-token' });
  });

  it('토큰 없음 -> null 반환 (에러 아님)', async () => {
    const { optionalAuthenticateUser } = await import('@/server/core/auth');
    const result = await optionalAuthenticateUser(createMockRequest());

    expect(result).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('토큰 있지만 무효 -> throw (토큰을 보냈는데 무효면 에러)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { optionalAuthenticateUser } = await import('@/server/core/auth');

    await expect(
      optionalAuthenticateUser(createMockRequest('Bearer bad-token')),
    ).rejects.toThrow('Invalid or expired token');
  });
});
