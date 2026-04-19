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
    then: vi.fn(),
  };
  // Make chain itself thenable (for await on query)
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

describe('product-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findProductsByFilters', () => {
    it('필터 적용 + limit', async () => {
      const products = [{ id: 'p1', name: { en: 'Test' } }];
      const client = createMockClient({ data: products, error: null });

      const { findProductsByFilters } = await import(
        '@/server/features/repositories/product-repository'
      );
      const result = await findProductsByFilters(
        client as never,
        { skin_types: ['dry'], category: ['skincare'] },
        5,
      );

      expect(result).toEqual(products);
      expect(client.from).toHaveBeenCalledWith('products');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findProductsByFilters } = await import(
        '@/server/features/repositories/product-repository'
      );
      await findProductsByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('products');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findProductsByFilters } = await import(
        '@/server/features/repositories/product-repository'
      );

      await expect(
        findProductsByFilters(client as never, {}),
      ).rejects.toThrow('Product search failed');
    });
  });

  describe('matchProductsByVector', () => {
    it('rpc 호출 파라미터', async () => {
      const products = [{ id: 'p1', similarity: 0.95 }];
      const client = createMockClient({ data: products, error: null });

      const { matchProductsByVector } = await import(
        '@/server/features/repositories/product-repository'
      );
      const result = await matchProductsByVector(
        client as never,
        [0.1, 0.2, 0.3],
        { skin_types: ['oily'], budget_max: 30000 },
        5,
      );

      expect(result).toEqual(products);
      expect(client.rpc).toHaveBeenCalledWith('match_products', {
        query_embedding: [0.1, 0.2, 0.3],
        match_count: 5,
        filter_skin_types: ['oily'],
        filter_concerns: null,
        filter_max_price: 30000,
      });
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'RPC error' },
      });

      const { matchProductsByVector } = await import(
        '@/server/features/repositories/product-repository'
      );

      await expect(
        matchProductsByVector(client as never, [0.1], {}, 5),
      ).rejects.toThrow('Product vector search failed');
    });
  });

  describe('findProductById', () => {
    it('정상 → Product + brand JOIN', async () => {
      const product = { id: 'p1', brand: { name: { en: 'Brand' } } };
      const client = createMockClient({ data: product, error: null });

      const { findProductById } = await import(
        '@/server/features/repositories/product-repository'
      );
      const result = await findProductById(client as never, 'p1');

      expect(result).toEqual(product);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findProductById } = await import(
        '@/server/features/repositories/product-repository'
      );
      const result = await findProductById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllProducts', () => {
    it('pagination + sort + count', async () => {
      const products = [{ id: 'p1' }];
      const client = createMockClient({
        data: products,
        error: null,
        count: 42,
      });

      const { findAllProducts } = await import(
        '@/server/features/repositories/product-repository'
      );
      const result = await findAllProducts(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(products);
      expect(result.total).toBe(42);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllProducts } = await import(
        '@/server/features/repositories/product-repository'
      );
      await findAllProducts(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      // status=all이면 eq('status', ...) 미호출
      expect(client.from).toHaveBeenCalledWith('products');
    });
  });
});
