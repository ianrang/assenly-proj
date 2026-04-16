import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('extraction-handler', () => {
  describe('executeExtractUserProfile', () => {
    it('정상 추출 → 프로필 반환', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_types: ['oily'],
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
      });

      expect(result).toEqual({
        skin_types: ['oily'],
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
      });
    });

    it('전부 null → 정상 동작 (VP-3)', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_types: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
      });

      expect(result).toEqual({
        skin_types: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
      });
    });

    it('부분 추출 → null 필드 유지', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_types: ['dry'],
        skin_concerns: null,
        stay_days: 7,
        budget_level: null,
        age_range: null,
      });

      expect((result as { skin_types: string[] }).skin_types).toEqual(['dry']);
      expect((result as { stay_days: number }).stay_days).toBe(7);
      expect((result as { budget_level: null }).budget_level).toBeNull();
    });

    it('잘못된 입력 → extraction_skipped', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'invalid_value',
      });

      expect(result).toEqual({
        status: 'extraction_skipped',
        reason: 'parse_error',
      });
    });

    it('zod 스키마: budget_level moderate (not mid)', async () => {
      const { extractUserProfileSchema } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );

      expect(() => extractUserProfileSchema.parse({
        skin_types: null, skin_concerns: null, stay_days: null,
        budget_level: 'mid', age_range: null,
      })).toThrow();

      const result = extractUserProfileSchema.parse({
        skin_types: null, skin_concerns: null, stay_days: null,
        budget_level: 'moderate', age_range: null,
      });
      expect(result.budget_level).toBe('moderate');
    });

    it('NEW-17: learned_preferences is not part of schema', async () => {
      const { extractUserProfileSchema } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );

      const shape = (extractUserProfileSchema as unknown as { shape: Record<string, unknown> }).shape;
      expect('learned_preferences' in shape).toBe(false);
    });
  });
});
