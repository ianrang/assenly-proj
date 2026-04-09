import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Product } from '@/shared/types/domain';

function createProduct(
  overrides: Partial<Product> & { id: string },
): Product {
  return {
    name: { en: 'Test Product' },
    description: null,
    brand_id: null,
    category: null,
    subcategory: null,
    skin_types: [],
    hair_types: [],
    concerns: [],
    key_ingredients: null,
    price: null,
    volume: null,
    purchase_links: null,
    english_label: false,
    tourist_popular: false,
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    review_summary: null,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('shopping/scoreProducts', () => {
  it('선호 성분 매칭 → 점수 가산 + reasons', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({
        id: 'p1',
        key_ingredients: ['niacinamide', 'retinol', 'vitamin_c'],
      }),
    ];

    const result = scoreProducts(products, ['niacinamide', 'retinol'], []);

    expect(result[0].score).toBeGreaterThan(0.5);
    expect(result[0].reasons).toContain('niacinamide');
    expect(result[0].reasons).toContain('retinol');
  });

  it('기피 성분 매칭 → 점수 감산 + warnings', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({
        id: 'p1',
        key_ingredients: ['alcohol', 'fragrance'],
      }),
    ];

    const result = scoreProducts(products, [], ['alcohol', 'fragrance']);

    expect(result[0].score).toBeLessThan(0.5);
    expect(result[0].warnings).toContain('alcohol');
    expect(result[0].warnings).toContain('fragrance');
  });

  it('선호+기피 동시 → 상쇄', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({
        id: 'p1',
        key_ingredients: ['niacinamide', 'alcohol'],
      }),
    ];

    // +0.1 (niacinamide) - 0.15 (alcohol) = 0.45
    const result = scoreProducts(
      products,
      ['niacinamide'],
      ['alcohol'],
    );

    expect(result[0].score).toBeCloseTo(0.45, 5);
    expect(result[0].reasons).toContain('niacinamide');
    expect(result[0].warnings).toContain('alcohol');
  });

  it('key_ingredients null → 기본 점수', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({ id: 'p1', key_ingredients: null }),
    ];

    const result = scoreProducts(
      products,
      ['niacinamide'],
      ['alcohol'],
    );

    expect(result[0].score).toBe(0.5);
    expect(result[0].reasons).toEqual([]);
    expect(result[0].warnings).toEqual([]);
  });

  it('DV-1/2 빈 배열 → 기본 점수 (VP-3)', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({
        id: 'p1',
        key_ingredients: ['niacinamide', 'retinol'],
      }),
    ];

    const result = scoreProducts(products, [], []);

    expect(result[0].score).toBe(0.5);
  });

  it('score clamp 0~1 — 다수 기피 시 0 미만 방지', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({
        id: 'p1',
        key_ingredients: ['a', 'b', 'c', 'd', 'e'],
      }),
    ];

    // 5 × -0.15 = -0.75, base 0.5 → -0.25 → clamped to 0
    const result = scoreProducts(
      products,
      [],
      ['a', 'b', 'c', 'd', 'e'],
    );

    expect(result[0].score).toBe(0);
  });

  it('VP-1: is_highlighted 그대로 전달', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({ id: 'p1', is_highlighted: true, key_ingredients: ['x'] }),
      createProduct({ id: 'p2', is_highlighted: false, key_ingredients: ['x'] }),
    ];

    const result = scoreProducts(products, [], []);

    expect(result[0].is_highlighted).toBe(true);
    expect(result[1].is_highlighted).toBe(false);
  });

  it('VP-1 네거티브: is_highlighted가 점수에 영향 없음', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const products = [
      createProduct({ id: 'hl', is_highlighted: true, key_ingredients: ['niacinamide', 'retinol'] }),
      createProduct({ id: 'no-hl', is_highlighted: false, key_ingredients: ['niacinamide', 'retinol'] }),
    ];

    const result = scoreProducts(products, ['niacinamide'], ['retinol']);

    // 동일 성분 → 동일 점수. is_highlighted 차이는 점수에 무영향
    const hlItem = result.find((r) => r.id === 'hl')!;
    const noHlItem = result.find((r) => r.id === 'no-hl')!;
    expect(hlItem.score).toBe(noHlItem.score);
    expect(hlItem.reasons).toEqual(noHlItem.reasons);
    expect(hlItem.warnings).toEqual(noHlItem.warnings);
  });

  it('빈 배열 입력 → 빈 배열 반환', async () => {
    const { scoreProducts } = await import(
      '@/server/features/beauty/shopping'
    );

    const result = scoreProducts([], ['niacinamide'], ['alcohol']);

    expect(result).toEqual([]);
  });
});
