import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
  };
}

describe('store-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findStoresByFilters', () => {
    it('필터 적용 + limit', async () => {
      const stores = [{ id: 's1', name: { en: 'Olive Young' } }];
      const client = createMockClient({ data: stores, error: null });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoresByFilters(
        client as never,
        { district: 'gangnam', store_type: 'drugstore' },
        5,
      );

      expect(result).toEqual(stores);
      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );
      await findStoresByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );

      await expect(
        findStoresByFilters(client as never, {}),
      ).rejects.toThrow('Store search failed');
    });
  });

  describe('findStoreById', () => {
    it('정상 → Store', async () => {
      const store = { id: 's1', name: { en: 'Olive Young' } };
      const client = createMockClient({ data: store, error: null });

      const { findStoreById } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoreById(client as never, 's1');

      expect(result).toEqual(store);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findStoreById } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoreById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllStores', () => {
    it('pagination + sort + count', async () => {
      const stores = [{ id: 's1' }];
      const client = createMockClient({
        data: stores,
        error: null,
        count: 25,
      });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findAllStores(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(stores);
      expect(result.total).toBe(25);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );
      await findAllStores(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );

      await expect(
        findAllStores(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Store list retrieval failed');
    });
  });
});
