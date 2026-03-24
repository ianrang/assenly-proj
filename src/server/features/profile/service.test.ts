import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Each test creates its own mock client with precise chain behavior

describe('profile/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertProfile', () => {
    it('정상: UPSERT 호출 + onConflict user_id', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const client = { from: vi.fn(() => ({ upsert: mockUpsert })) };

      const { upsertProfile } = await import(
        '@/server/features/profile/service'
      );
      await upsertProfile(client as never, 'user-123', {
        skin_type: 'oily',
        hair_type: 'straight',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
      });

      expect(client.from).toHaveBeenCalledWith('user_profiles');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          skin_type: 'oily',
          hair_type: 'straight',
          country: 'US',
          age_range: null,
        }),
        { onConflict: 'user_id' },
      );
    });

    it('DB 에러 시 throw — 내부 메시지 미노출', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'duplicate key violation' },
      });
      const client = { from: vi.fn(() => ({ upsert: mockUpsert })) };

      const { upsertProfile } = await import(
        '@/server/features/profile/service'
      );

      await expect(
        upsertProfile(client as never, 'user-123', {
          skin_type: 'oily',
          hair_type: null,
          hair_concerns: [],
          country: 'KR',
          language: 'ko',
        }),
      ).rejects.toThrow('Profile creation failed');
    });
  });

  describe('getProfile', () => {
    it('존재: ProfileRow 반환', async () => {
      const profileRow = {
        user_id: 'user-123',
        skin_type: 'oily',
        hair_type: 'straight',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        beauty_summary: null,
        updated_at: '2026-03-25T00:00:00Z',
      };
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: profileRow, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const client = { from: vi.fn(() => ({ select: mockSelect })) };

      const { getProfile } = await import(
        '@/server/features/profile/service'
      );
      const result = await getProfile(client as never, 'user-123');

      expect(result).toEqual(profileRow);
      expect(client.from).toHaveBeenCalledWith('user_profiles');
    });

    it('미존재: null 반환', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const client = { from: vi.fn(() => ({ select: mockSelect })) };

      const { getProfile } = await import(
        '@/server/features/profile/service'
      );
      const result = await getProfile(client as never, 'user-123');

      expect(result).toBeNull();
    });

    it('DB 에러 시 throw', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection failed' },
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const client = { from: vi.fn(() => ({ select: mockSelect })) };

      const { getProfile } = await import(
        '@/server/features/profile/service'
      );

      await expect(getProfile(client as never, 'user-123')).rejects.toThrow(
        'Profile retrieval failed',
      );
    });
  });

  describe('updateProfile', () => {
    it('정상: 부분 필드만 UPDATE', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const client = { from: vi.fn(() => ({ update: mockUpdate })) };

      const { updateProfile } = await import(
        '@/server/features/profile/service'
      );
      await updateProfile(client as never, 'user-123', {
        skin_type: 'dry',
      });

      expect(client.from).toHaveBeenCalledWith('user_profiles');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ skin_type: 'dry' }),
      );
    });

    it('DB 에러 시 throw', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: 'update failed' },
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const client = { from: vi.fn(() => ({ update: mockUpdate })) };

      const { updateProfile } = await import(
        '@/server/features/profile/service'
      );

      await expect(
        updateProfile(client as never, 'user-123', { skin_type: 'dry' }),
      ).rejects.toThrow('Profile update failed');
    });
  });
});
