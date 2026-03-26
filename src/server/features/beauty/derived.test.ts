import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { LearnedPreference } from '@/shared/types/profile';

function createPref(
  overrides: Partial<LearnedPreference> & {
    preference: string;
    direction: 'like' | 'dislike';
  },
): LearnedPreference {
  return {
    id: 'pref-1',
    category: 'ingredient',
    confidence: 0.8,
    source: 'conversation',
    ...overrides,
  };
}

describe('derived/calculatePreferredIngredients', () => {
  it('skinType 매칭 → 해당 성분 포함', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculatePreferredIngredients('dry', [], []);

    expect(result).toContain('hyaluronic_acid');
    expect(result).toContain('ceramide');
  });

  it('concerns 매칭 → 해당 성분 포함', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculatePreferredIngredients(null, ['acne', 'wrinkles'], []);

    expect(result).toContain('salicylic_acid');
    expect(result).toContain('retinol');
  });

  it('learned likes 추가', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const likes = [createPref({ preference: 'snail_mucin', direction: 'like' })];
    const result = calculatePreferredIngredients(null, [], likes);

    expect(result).toContain('snail_mucin');
  });

  it('중복 제거 — skinType + concerns 겹침', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    // dry → hyaluronic_acid, dryness → hyaluronic_acid
    const result = calculatePreferredIngredients('dry', ['dryness'], []);

    const count = result.filter((i) => i === 'hyaluronic_acid').length;
    expect(count).toBe(1);
  });

  it('VP-3: 모두 null/빈 → 빈 배열', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculatePreferredIngredients(null, [], []);

    expect(result).toEqual([]);
  });
});

describe('derived/calculateAvoidedIngredients', () => {
  it('skinType caution → 해당 성분 포함', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculateAvoidedIngredients('sensitive', []);

    expect(result).toContain('fragrance');
    expect(result).toContain('alcohol');
  });

  it('learned dislikes 추가', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const dislikes = [
      createPref({ preference: 'paraben', direction: 'dislike' }),
    ];
    const result = calculateAvoidedIngredients(null, dislikes);

    expect(result).toContain('paraben');
  });

  it('VP-3: skinType null → learned만', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const dislikes = [
      createPref({ preference: 'sulfate', direction: 'dislike' }),
    ];
    const result = calculateAvoidedIngredients(null, dislikes);

    expect(result).toEqual(['sulfate']);
  });
});

describe('derived/calculateSegment', () => {
  it('luxury + clinic → luxury_beauty_seeker', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculateSegment('25-29', ['clinic', 'shopping'], 'luxury', []);
    expect(result).toBe('luxury_beauty_seeker');
  });

  it('VP-3: 모두 null/빈 → null', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculateSegment(null, [], null, []);
    expect(result).toBeNull();
  });
});
