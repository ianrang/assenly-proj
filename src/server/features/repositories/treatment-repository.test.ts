import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
  const thenableChain = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      return target[prop as keyof typeof target];
    },
  });

  return {
    from: vi.fn(() => thenableChain),
    rpc: vi.fn().mockResolvedValue(resolvedValue),
  };
}

describe('treatment-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findTreatmentsByFilters', () => {
    it('필터 적용 + limit', async () => {
      const treatments = [{ id: 't1', name: { en: 'Botox' } }];
      const client = createMockClient({ data: treatments, error: null });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentsByFilters(
        client as never,
        { skin_types: ['dry'], category: ['injection'], max_downtime: 3 },
        5,
      );

      expect(result).toEqual(treatments);
      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      await findTreatmentsByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        findTreatmentsByFilters(client as never, {}),
      ).rejects.toThrow('Treatment search failed');
    });
  });

  describe('matchTreatmentsByVector', () => {
    it('rpc 호출 파라미터', async () => {
      const treatments = [{ id: 't1', similarity: 0.92 }];
      const client = createMockClient({ data: treatments, error: null });

      const { matchTreatmentsByVector } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await matchTreatmentsByVector(
        client as never,
        [0.1, 0.2, 0.3],
        { skin_types: ['oily'], budget_max: 200000, max_downtime: 3 },
        5,
      );

      expect(result).toEqual(treatments);
      expect(client.rpc).toHaveBeenCalledWith('match_treatments', {
        query_embedding: [0.1, 0.2, 0.3],
        match_count: 5,
        filter_skin_types: ['oily'],
        filter_concerns: null,
        filter_max_price: 200000,
        filter_max_downtime: 3,
      });
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'RPC error' },
      });

      const { matchTreatmentsByVector } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        matchTreatmentsByVector(client as never, [0.1], {}, 5),
      ).rejects.toThrow('Treatment vector search failed');
    });
  });

  describe('findTreatmentById', () => {
    it('정상 → Treatment + clinics JOIN', async () => {
      const treatment = {
        id: 't1',
        name: { en: 'Botox' },
        clinics: [{ clinic: { id: 'c1', name: { en: 'Clinic A' } } }],
      };
      const client = createMockClient({ data: treatment, error: null });

      const { findTreatmentById } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentById(client as never, 't1');

      expect(result).toEqual(treatment);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findTreatmentById } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllTreatments', () => {
    it('pagination + sort + count', async () => {
      const treatments = [{ id: 't1' }];
      const client = createMockClient({
        data: treatments,
        error: null,
        count: 15,
      });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findAllTreatments(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(treatments);
      expect(result.total).toBe(15);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      await findAllTreatments(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        findAllTreatments(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Treatment list retrieval failed');
    });
  });
});
