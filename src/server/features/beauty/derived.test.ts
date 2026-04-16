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

    const result = calculatePreferredIngredients(['dry'], [], []);

    expect(result).toContain('hyaluronic_acid');
    expect(result).toContain('ceramide');
  });

  it('concerns 매칭 → 해당 성분 포함', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculatePreferredIngredients([], ['acne', 'wrinkles'], []);

    expect(result).toContain('salicylic_acid');
    expect(result).toContain('retinol');
  });

  it('learned likes 추가', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const likes = [createPref({ preference: 'snail_mucin', direction: 'like' })];
    const result = calculatePreferredIngredients([], [], likes);

    expect(result).toContain('snail_mucin');
  });

  it('중복 제거 — skinType + concerns 겹침', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    // dry → hyaluronic_acid, dryness → hyaluronic_acid
    const result = calculatePreferredIngredients(['dry'], ['dryness'], []);

    const count = result.filter((i) => i === 'hyaluronic_acid').length;
    expect(count).toBe(1);
  });

  it('VP-3: 모두 빈 → 빈 배열', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculatePreferredIngredients([], [], []);

    expect(result).toEqual([]);
  });

  it('복수 skinTypes → preferred 합집합', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const r = calculatePreferredIngredients(['dry', 'sensitive'], [], []);
    expect(r).toContain('hyaluronic_acid'); // dry
    expect(r).toContain('centella_asiatica'); // sensitive
  });
});

describe('derived/calculateAvoidedIngredients', () => {
  it('skinType caution → 해당 성분 포함', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculateAvoidedIngredients(['sensitive'], []);

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
    const result = calculateAvoidedIngredients([], dislikes);

    expect(result).toContain('paraben');
  });

  it('VP-3: skinTypes 빈 배열 → learned만', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );

    const dislikes = [
      createPref({ preference: 'sulfate', direction: 'dislike' }),
    ];
    const result = calculateAvoidedIngredients([], dislikes);

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

  it('budget + shopping → budget_beauty_explorer', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );
    expect(calculateSegment(null, ['shopping'], 'budget', [])).toBe('budget_beauty_explorer');
  });

  it('clinic만 → treatment_focused', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );
    expect(calculateSegment(null, ['clinic'], 'moderate', [])).toBe('treatment_focused');
  });

  it('shopping만 (clinic 없음) → product_focused', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );
    expect(calculateSegment(null, ['shopping'], 'moderate', [])).toBe('product_focused');
  });

  it('interests만 있고 분류 미해당 → general_beauty_traveler', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );
    expect(calculateSegment(null, ['dining'], 'moderate', [])).toBe('general_beauty_traveler');
  });

  it('VP-3: 모두 null/빈 → null', async () => {
    const { calculateSegment } = await import(
      '@/server/features/beauty/derived'
    );

    const result = calculateSegment(null, [], null, []);
    expect(result).toBeNull();
  });
});

describe('derived/필터링 검증', () => {
  it('calculatePreferredIngredients: category가 ingredient 아닌 항목 무시', async () => {
    const { calculatePreferredIngredients } = await import(
      '@/server/features/beauty/derived'
    );
    const likes = [
      createPref({ category: 'brand', preference: 'cosrx', direction: 'like' }),
      createPref({ preference: 'niacinamide', direction: 'like' }),
    ];
    const result = calculatePreferredIngredients([], [], likes);
    expect(result).toContain('niacinamide');
    expect(result).not.toContain('cosrx');
  });

  it('calculateAvoidedIngredients: direction이 dislike 아닌 항목 무시', async () => {
    const { calculateAvoidedIngredients } = await import(
      '@/server/features/beauty/derived'
    );
    const mixed = [
      createPref({ preference: 'retinol', direction: 'like' }),
      createPref({ preference: 'alcohol', direction: 'dislike' }),
    ];
    const result = calculateAvoidedIngredients([], mixed);
    expect(result).toContain('alcohol');
    expect(result).not.toContain('retinol');
  });
});

describe('resolveConflicts (2A: avoided 우선)', () => {
  it('충돌 없음 → passthrough', async () => {
    const { resolveConflicts } = await import('@/server/features/beauty/derived');
    const r = resolveConflicts(['a', 'b'], ['c']);
    expect(r.preferred).toEqual(['a', 'b']);
    expect(r.avoided).toEqual(['c']);
  });

  it('충돌 발생 → preferred에서 제거, avoided 유지', async () => {
    const { resolveConflicts } = await import('@/server/features/beauty/derived');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveConflicts(['a', 'b', 'c'], ['b']);
    expect(r.preferred).toEqual(['a', 'c']);
    expect(r.avoided).toEqual(['b']);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('완전 상쇄 (preferred ⊆ avoided)', async () => {
    const { resolveConflicts } = await import('@/server/features/beauty/derived');
    const r = resolveConflicts(['a'], ['a', 'b']);
    expect(r.preferred).toEqual([]);
    expect(r.avoided).toEqual(['a', 'b']);
  });
});
