import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockFindAllProducts = vi.fn();
vi.mock('@/server/features/repositories/product-repository', () => ({
  findAllProducts: (...args: unknown[]) => mockFindAllProducts(...args),
}));

const mockFindAllTreatments = vi.fn();
vi.mock('@/server/features/repositories/treatment-repository', () => ({
  findAllTreatments: (...args: unknown[]) => mockFindAllTreatments(...args),
}));

const mockFindAllStores = vi.fn();
vi.mock('@/server/features/repositories/store-repository', () => ({
  findAllStores: (...args: unknown[]) => mockFindAllStores(...args),
}));

const mockFindAllClinics = vi.fn();
vi.mock('@/server/features/repositories/clinic-repository', () => ({
  findAllClinics: (...args: unknown[]) => mockFindAllClinics(...args),
}));

const mockScoreProducts = vi.fn();
vi.mock('@/server/features/beauty/shopping', () => ({
  scoreProducts: (...args: unknown[]) => mockScoreProducts(...args),
}));

const mockScoreTreatments = vi.fn();
vi.mock('@/server/features/beauty/treatment', () => ({
  scoreTreatments: (...args: unknown[]) => mockScoreTreatments(...args),
}));

const mockScoreStores = vi.fn();
vi.mock('@/server/features/beauty/store', () => ({
  scoreStores: (...args: unknown[]) => mockScoreStores(...args),
}));

const mockScoreClinics = vi.fn();
vi.mock('@/server/features/beauty/clinic', () => ({
  scoreClinics: (...args: unknown[]) => mockScoreClinics(...args),
}));

const mockRank = vi.fn();
vi.mock('@/server/features/beauty/judgment', () => ({
  rank: (...args: unknown[]) => mockRank(...args),
}));

import type { ExploreDomain } from '@/shared/types/explore';
import type { SupabaseClient } from '@supabase/supabase-js';

const MOCK_CLIENT = { _mock: true } as unknown as SupabaseClient;

describe('domain-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('4개 도메인 모두 핸들러가 등록되어 있다', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const domains: ExploreDomain[] = ['products', 'treatments', 'stores', 'clinics'];
    for (const domain of domains) {
      const handler = getDomainHandler(domain);
      expect(handler).toBeDefined();
      expect(handler!.fetch).toBeTypeOf('function');
      expect(handler!.score).toBeTypeOf('function');
    }
  });

  it('유효하지 않은 도메인 → null 반환', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('invalid' as ExploreDomain);
    expect(handler).toBeNull();
  });

  it('products fetch → findAllProducts 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('products')!;
    const mockResult = { data: [{ id: 'p1' }], total: 1 };
    mockFindAllProducts.mockResolvedValue(mockResult);

    const result = await handler.fetch(
      MOCK_CLIENT,
      { category: 'skincare' },
      { page: 1, pageSize: 10 },
      { field: 'rating', order: 'desc' as const },
    );

    expect(mockFindAllProducts).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResult);
  });

  it('stores fetch → findAllStores 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('stores')!;
    const mockResult = { data: [{ id: 's1' }], total: 1 };
    mockFindAllStores.mockResolvedValue(mockResult);

    const result = await handler.fetch(
      MOCK_CLIENT,
      { store_type: 'olive_young' },
      { page: 1, pageSize: 10 },
      { field: 'rating', order: 'desc' as const },
    );

    expect(mockFindAllStores).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResult);
  });

  it('products score → scoreProducts + rank 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('products')!;
    const items = [{ id: 'p1', key_ingredients: ['niacinamide'] }];
    const scored = [{ id: 'p1', score: 0.6, reasons: ['niacinamide'], warnings: [], is_highlighted: false }];
    const ranked = [{ item: scored[0], rank: 1, is_highlighted: false }];
    mockScoreProducts.mockReturnValue(scored);
    mockRank.mockReturnValue(ranked);

    const result = handler.score(items, ['niacinamide'], []);

    expect(mockScoreProducts).toHaveBeenCalledWith(items, ['niacinamide'], []);
    expect(mockRank).toHaveBeenCalledWith(scored);
    expect(result).toEqual(ranked);
  });

  it('stores score → scoreStores + rank 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('stores')!;
    const items = [{ id: 's1', english_support: 'fluent' }];
    const scored = [{ id: 's1', score: 0.7, reasons: ['Fluent English support'], warnings: [], is_highlighted: false }];
    const ranked = [{ item: scored[0], rank: 1, is_highlighted: false }];
    mockScoreStores.mockReturnValue(scored);
    mockRank.mockReturnValue(ranked);

    const result = handler.score(items, null, null);

    expect(mockScoreStores).toHaveBeenCalledWith(items, null);
    expect(mockRank).toHaveBeenCalledWith(scored);
    expect(result).toEqual(ranked);
  });

  it('treatments fetch → findAllTreatments 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('treatments')!;
    const mockResult = { data: [{ id: 't1' }], total: 1 };
    mockFindAllTreatments.mockResolvedValue(mockResult);

    const result = await handler.fetch(
      MOCK_CLIENT,
      { concerns: ['acne'], category: 'laser' },
      { page: 1, pageSize: 10 },
      { field: 'rating', order: 'desc' as const },
    );

    expect(mockFindAllTreatments).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResult);
  });

  it('clinics fetch → findAllClinics 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('clinics')!;
    const mockResult = { data: [{ id: 'c1' }], total: 1 };
    mockFindAllClinics.mockResolvedValue(mockResult);

    const result = await handler.fetch(
      MOCK_CLIENT,
      { clinic_type: 'dermatology' },
      { page: 1, pageSize: 10 },
      { field: 'rating', order: 'desc' as const },
    );

    expect(mockFindAllClinics).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResult);
  });

  it('treatments score → scoreTreatments + rank 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('treatments')!;
    const items = [{ id: 't1', downtime_days: 3 }];
    const scored = [{ id: 't1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const ranked = [{ item: scored[0], rank: 1, is_highlighted: false }];
    mockScoreTreatments.mockReturnValue(scored);
    mockRank.mockReturnValue(ranked);

    const result = handler.score(items, null, null);

    expect(mockScoreTreatments).toHaveBeenCalledOnce();
    expect(mockRank).toHaveBeenCalledWith(scored);
    expect(result).toEqual(ranked);
  });

  it('clinics score → scoreClinics + rank 호출', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('clinics')!;
    const items = [{ id: 'c1', english_support: 'good' }];
    const scored = [{ id: 'c1', score: 0.65, reasons: ['Good English support'], warnings: [], is_highlighted: false }];
    const ranked = [{ item: scored[0], rank: 1, is_highlighted: false }];
    mockScoreClinics.mockReturnValue(scored);
    mockRank.mockReturnValue(ranked);

    const result = handler.score(items, 'en', null);

    expect(mockScoreClinics).toHaveBeenCalledWith(items, 'en');
    expect(mockRank).toHaveBeenCalledWith(scored);
    expect(result).toEqual(ranked);
  });

  it('빈 아이템 배열 → score는 빈 ranked 배열 반환', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('products')!;
    mockScoreProducts.mockReturnValue([]);
    mockRank.mockReturnValue([]);

    const result = handler.score([], [], []);

    expect(result).toEqual([]);
  });

  it('fetch 에러 → 그대로 throw', async () => {
    const { getDomainHandler } = await import(
      '@/server/features/explore/domain-handlers'
    );
    const handler = getDomainHandler('products')!;
    mockFindAllProducts.mockRejectedValue(new Error('DB error'));

    await expect(
      handler.fetch(MOCK_CLIENT, {}, { page: 1, pageSize: 10 }, { field: 'rating', order: 'desc' }),
    ).rejects.toThrow('DB error');
  });
});
