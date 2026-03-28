import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('extraction-handler', () => {
  describe('executeExtractUserProfile', () => {
    it('정상 추출 → 프로필 반환', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'oily',
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
        learned_preferences: [{ item: 'niacinamide', direction: 'prefer' }],
      });

      expect(result).toEqual({
        skin_type: 'oily',
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
        learned_preferences: [{ item: 'niacinamide', direction: 'prefer' }],
      });
    });

    it('전부 null → 정상 동작 (VP-3)', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });

      expect(result).toEqual({
        skin_type: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });
    });

    it('부분 추출 → null 필드 유지', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'dry',
        skin_concerns: null,
        stay_days: 7,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });

      expect((result as { skin_type: string }).skin_type).toBe('dry');
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
        skin_type: null, skin_concerns: null, stay_days: null,
        budget_level: 'mid', age_range: null, learned_preferences: null,
      })).toThrow();

      const result = extractUserProfileSchema.parse({
        skin_type: null, skin_concerns: null, stay_days: null,
        budget_level: 'moderate', age_range: null, learned_preferences: null,
      });
      expect(result.budget_level).toBe('moderate');
    });
  });
});
