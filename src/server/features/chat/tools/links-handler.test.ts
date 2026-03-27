import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
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

describe('links-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeGetExternalLinks', () => {
    it('clinic: external_links + booking_url 조합', async () => {
      const client = createMockClient({
        data: {
          external_links: [{ type: 'website', url: 'https://clinic.com', label: 'Site' }],
          booking_url: 'https://book.com',
        },
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({ type: 'website', url: 'https://clinic.com', label: 'Site' });
      expect(result.links[1]).toEqual({ type: 'booking', url: 'https://book.com', label: 'Book appointment' });
    });

    it('clinic: booking_url 없음 → external_links만', async () => {
      const client = createMockClient({
        data: { external_links: [{ type: 'map', url: 'https://map.com' }], booking_url: null },
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(1);
    });

    it('product: purchase_links null (컬럼 미존재) → 빈 배열', async () => {
      const client = createMockClient({ data: { purchase_links: null }, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'p1', entity_type: 'product' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('store: external_links null (컬럼 미존재) → 빈 배열', async () => {
      const client = createMockClient({ data: { external_links: null }, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 's1', entity_type: 'store' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('treatment: junction → clinics booking_url', async () => {
      const client = createMockClient({
        data: [{ clinic: { booking_url: 'https://book.clinic.com', name: { en: 'A' } } }],
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 't1', entity_type: 'treatment' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].type).toBe('booking');
    });

    it('미존재 엔티티 → 빈 배열', async () => {
      const client = createMockClient({ data: null, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'nonexistent', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('DB 에러 → 빈 배열 (tool-spec §4.2)', async () => {
      const client = {
        from: vi.fn(() => { throw new Error('DB error'); }),
      };

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });
  });
});
