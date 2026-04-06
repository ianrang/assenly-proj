import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// createServiceClient mock
const mockUpsert = vi.fn();
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
const mockClient = {
  from: mockFrom,
};

vi.mock('@/server/core/db', () => ({
  createServiceClient: () => mockClient,
}));

describe('registerAnonymousUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('정상: users UPSERT -> consent_records UPSERT -> 결과 반환', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    const { registerAnonymousUser } = await import(
      '@/server/features/auth/service'
    );
    const result = await registerAnonymousUser('user-uuid-123', { data_retention: true });

    expect(result).toEqual({ user_id: 'user-uuid-123' });

    // users UPSERT 확인
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-uuid-123', auth_method: 'anonymous' },
      { onConflict: 'id' },
    );

    // consent_records UPSERT 확인
    expect(mockFrom).toHaveBeenCalledWith('consent_records');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'user-uuid-123', data_retention: true },
      { onConflict: 'user_id' },
    );
  });

  it('data_retention=false -> 에러 (필수 동의)', async () => {
    const { registerAnonymousUser } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      registerAnonymousUser('user-uuid-123', { data_retention: false }),
    ).rejects.toThrow('data_retention consent is required');

    // DB 호출 없어야 함
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('users UPSERT 실패 -> throw (Q-7)', async () => {
    mockUpsert.mockResolvedValueOnce({
      error: { message: 'db error' },
    });

    const { registerAnonymousUser } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      registerAnonymousUser('user-uuid-123', { data_retention: true }),
    ).rejects.toThrow('User record creation failed');
  });

  it('consent_records UPSERT 실패 -> throw (Q-7)', async () => {
    // 첫 번째 upsert (users) 성공, 두 번째 (consent_records) 실패
    mockUpsert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'constraint violation' } });

    const { registerAnonymousUser } = await import(
      '@/server/features/auth/service'
    );

    await expect(
      registerAnonymousUser('user-uuid-123', { data_retention: true }),
    ).rejects.toThrow('Consent record creation failed');
  });

  it('Q-12 멱등성: 동일 userId 재요청 시 UPSERT로 중복 방지', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    const { registerAnonymousUser } = await import(
      '@/server/features/auth/service'
    );

    // 같은 userId로 두 번 호출
    await registerAnonymousUser('user-uuid-123', { data_retention: true });
    await registerAnonymousUser('user-uuid-123', { data_retention: true });

    // 두 번 모두 성공 (INSERT 중복 에러 없음 — UPSERT)
    expect(mockUpsert).toHaveBeenCalledTimes(4); // 2 tables x 2 calls
  });
});
