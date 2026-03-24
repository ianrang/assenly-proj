import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// createServiceClient mock
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
const mockSignInAnonymously = vi.fn();
const mockClient = {
  auth: { signInAnonymously: mockSignInAnonymously },
  from: mockFrom,
};

vi.mock('@/server/core/db', () => ({
  createServiceClient: () => mockClient,
}));

describe('createAnonymousSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('정상: signInAnonymously -> users INSERT -> consent_records INSERT -> 결과 반환', async () => {
    mockSignInAnonymously.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123' },
        session: { access_token: 'token-abc' },
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });

    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );
    const result = await createAnonymousSession({ data_retention: true });

    expect(result).toEqual({
      user_id: 'user-uuid-123',
      session_token: 'token-abc',
    });

    // users INSERT 확인
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockInsert).toHaveBeenCalledWith({
      id: 'user-uuid-123',
      auth_method: 'anonymous',
    });

    // consent_records INSERT 확인
    expect(mockFrom).toHaveBeenCalledWith('consent_records');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-uuid-123',
      data_retention: true,
    });
  });

  it('data_retention=false -> 에러 (필수 동의)', async () => {
    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      createAnonymousSession({ data_retention: false }),
    ).rejects.toThrow('data_retention consent is required');

    // Supabase 호출 없어야 함
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  it('signInAnonymously 실패 -> throw (Q-7)', async () => {
    mockSignInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Auth service unavailable' },
    });

    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      createAnonymousSession({ data_retention: true }),
    ).rejects.toThrow('Anonymous sign-in failed');

    // 내부 메시지 노출 금지 (E-4)
    try {
      await createAnonymousSession({ data_retention: true });
    } catch (e) {
      expect((e as Error).message).not.toContain('Auth service unavailable');
    }
  });

  it('users INSERT 실패 -> throw (Q-7)', async () => {
    mockSignInAnonymously.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123' },
        session: { access_token: 'token-abc' },
      },
      error: null,
    });
    // 첫 번째 insert (users) 실패
    mockInsert.mockResolvedValueOnce({
      error: { message: 'duplicate key violation' },
    });

    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      createAnonymousSession({ data_retention: true }),
    ).rejects.toThrow('User record creation failed');
  });

  it('consent_records INSERT 실패 -> throw (Q-7)', async () => {
    mockSignInAnonymously.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123' },
        session: { access_token: 'token-abc' },
      },
      error: null,
    });
    // 첫 번째 insert (users) 성공, 두 번째 (consent_records) 실패
    mockInsert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'constraint violation' } });

    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      createAnonymousSession({ data_retention: true }),
    ).rejects.toThrow('Consent record creation failed');
  });

  it('signInAnonymously 반환값에 user/session 누락 -> throw', async () => {
    mockSignInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const { createAnonymousSession } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      createAnonymousSession({ data_retention: true }),
    ).rejects.toThrow('Anonymous sign-in failed');
  });
});
