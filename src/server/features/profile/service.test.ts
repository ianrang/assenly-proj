import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from '@/shared/constants/profile-field-spec';

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
        skin_types: ['oily'],
        hair_type: 'straight',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
      });

      expect(client.from).toHaveBeenCalledWith('user_profiles');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          skin_types: ['oily'],
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
          skin_types: ['oily'],
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
        skin_types: ['oily'],
        hair_type: 'straight',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        beauty_summary: null,
        onboarding_completed_at: null,
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
        skin_types: ['dry'],
      });

      expect(client.from).toHaveBeenCalledWith('user_profiles');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ skin_types: ['dry'] }),
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
        updateProfile(client as never, 'user-123', { skin_types: ['dry'] }),
      ).rejects.toThrow('Profile update failed');
    });
  });

  describe('createMinimalProfile', () => {
    it('정상: INSERT 호출 + language 설정', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const client = { from: vi.fn(() => ({ insert: mockInsert })) };

      const { createMinimalProfile } = await import(
        '@/server/features/profile/service'
      );
      await createMinimalProfile(client as never, 'user-456', 'en');

      expect(client.from).toHaveBeenCalledWith('user_profiles');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-456',
          language: 'en',
        }),
      );
    });

    it('PK 충돌 시 throw + Supabase 에러 메시지 포함', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        error: { message: 'duplicate key value violates unique constraint' },
      });
      const client = { from: vi.fn(() => ({ insert: mockInsert })) };

      const { createMinimalProfile } = await import(
        '@/server/features/profile/service'
      );

      await expect(
        createMinimalProfile(client as never, 'user-456', 'en'),
      ).rejects.toThrow('Minimal profile creation failed: duplicate key value violates unique constraint');
    });
  });

  // NEW-9b + adversarial review C3: markOnboardingCompleted
  describe('markOnboardingCompleted', () => {
    function buildClient(opts: {
      precheck: { data: unknown; error: unknown };
      update?: { error: unknown };
    }) {
      const mockPrecheckSingle = vi.fn().mockResolvedValue(opts.precheck);
      const mockPrecheckEq = vi.fn().mockReturnValue({ maybeSingle: mockPrecheckSingle });
      const mockPrecheckSelect = vi.fn().mockReturnValue({ eq: mockPrecheckEq });

      const mockUpdateIs = vi.fn().mockResolvedValue(opts.update ?? { error: null });
      const mockUpdateEq = vi.fn().mockReturnValue({ is: mockUpdateIs });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      // `.from()` 첫 호출은 select(precheck), 두 번째 호출은 update
      let fromCallCount = 0;
      const client = {
        from: vi.fn(() => {
          fromCallCount += 1;
          if (fromCallCount === 1) {
            return { select: mockPrecheckSelect };
          }
          return { update: mockUpdate };
        }),
      };

      return { client, mockPrecheckSingle, mockUpdate };
    }

    it('정상: 프로필 존재 + update 성공', async () => {
      const { client, mockUpdate } = buildClient({
        precheck: { data: { user_id: 'user-1' }, error: null },
      });

      const { markOnboardingCompleted } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        markOnboardingCompleted(client as never, 'user-1'),
      ).resolves.not.toThrow();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('프로필 row 부재 시 throw (C3: 0-row silent no-op 방어)', async () => {
      const { client, mockUpdate } = buildClient({
        precheck: { data: null, error: null },
      });

      const { markOnboardingCompleted } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        markOnboardingCompleted(client as never, 'user-ghost'),
      ).rejects.toThrow('profile row missing');
      // update 호출 안 됨 — precheck에서 이미 throw
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('precheck SELECT 실패 시 throw', async () => {
      const { client } = buildClient({
        precheck: { data: null, error: { message: 'db error' } },
      });

      const { markOnboardingCompleted } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        markOnboardingCompleted(client as never, 'user-1'),
      ).rejects.toThrow('precheck failed');
    });

    it('이미 완료된 사용자 재호출: WHERE IS NULL 조건으로 no-op, 에러 아님 (원샷 I4)', async () => {
      // 프로필은 존재, update는 0행 매치(이미 completed_at 설정됨) — 에러 없음
      const { client } = buildClient({
        precheck: { data: { user_id: 'user-1' }, error: null },
        update: { error: null },
      });

      const { markOnboardingCompleted } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        markOnboardingCompleted(client as never, 'user-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('applyAiExtraction (RPC wrapper)', () => {
    it('정상: apply_ai_profile_patch 호출 + applied 반환', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: ['skin_types'], error: null });
      const client = { rpc: mockRpc };

      const { applyAiExtraction } = await import('@/server/features/profile/service');
      const r = await applyAiExtraction(client as never, 'user-1', {
        skin_types: ['dry'],
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'apply_ai_profile_patch',
        expect.objectContaining({
          p_user_id: 'user-1',
          p_patch: { skin_types: ['dry'] },
          p_spec: PROFILE_FIELD_SPEC,
        }),
      );
      expect(r.applied).toEqual(['skin_types']);
    });

    it('RPC 에러 → throw', async () => {
      const mockRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      await expect(
        applyAiExtraction(client as never, 'user-1', { skin_types: ['dry'] }),
      ).rejects.toThrow('AI profile patch failed');
    });

    it('RPC data=null → applied=[]', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      const r = await applyAiExtraction(client as never, 'user-1', { age_range: '25-29' });
      expect(r.applied).toEqual([]);
    });

    it('M4: applyAiExtraction은 PROFILE_FIELD_SPEC만 전달 (레지스트리 혼동 방지)', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      await applyAiExtraction(client as never, 'user-1', {});
      const args = mockRpc.mock.calls[0][1];
      expect(args.p_spec).toBe(PROFILE_FIELD_SPEC);
      expect(args.p_spec).not.toBe(JOURNEY_FIELD_SPEC);
    });
  });

  describe('applyAiExtractionToJourney (RPC wrapper)', () => {
    it('정상: apply_ai_journey_patch 호출', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: ['skin_concerns'], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      const r = await applyAiExtractionToJourney(client as never, 'user-1', {
        skin_concerns: ['acne'],
      });
      expect(mockRpc).toHaveBeenCalledWith(
        'apply_ai_journey_patch',
        expect.objectContaining({
          p_user_id: 'user-1',
          p_patch: { skin_concerns: ['acne'] },
          p_spec: JOURNEY_FIELD_SPEC,
        }),
      );
      expect(r.applied).toEqual(['skin_concerns']);
    });

    it('RPC 에러 → throw', async () => {
      const mockRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        applyAiExtractionToJourney(client as never, 'user-1', { skin_concerns: ['acne'] }),
      ).rejects.toThrow('AI journey patch failed');
    });

    it('M4: applyAiExtractionToJourney는 JOURNEY_FIELD_SPEC만 전달 (레지스트리 혼동 방지)', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      await applyAiExtractionToJourney(client as never, 'user-1', {});
      const args = mockRpc.mock.calls[0][1];
      expect(args.p_spec).toBe(JOURNEY_FIELD_SPEC);
      expect(args.p_spec).not.toBe(PROFILE_FIELD_SPEC);
    });
  });
});
