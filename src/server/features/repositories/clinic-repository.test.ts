import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

describe('clinic-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findClinicsByFilters', () => {
    it('필터 적용 + limit', async () => {
      const clinics = [{ id: 'c1', name: { en: 'Seoul Derma' } }];
      const client = createMockClient({ data: clinics, error: null });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicsByFilters(
        client as never,
        { district: 'gangnam', clinic_type: 'dermatology' },
        5,
      );

      expect(result).toEqual(clinics);
      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      await findClinicsByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );

      await expect(
        findClinicsByFilters(client as never, {}),
      ).rejects.toThrow('Clinic search failed');
    });
  });

  describe('findClinicById', () => {
    it('정상 → Clinic', async () => {
      const clinic = { id: 'c1', name: { en: 'Seoul Derma' } };
      const client = createMockClient({ data: clinic, error: null });

      const { findClinicById } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicById(client as never, 'c1');

      expect(result).toEqual(clinic);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findClinicById } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllClinics', () => {
    it('pagination + sort + count', async () => {
      const clinics = [{ id: 'c1' }];
      const client = createMockClient({
        data: clinics,
        error: null,
        count: 12,
      });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findAllClinics(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(clinics);
      expect(result.total).toBe(12);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      await findAllClinics(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );

      await expect(
        findAllClinics(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Clinic list retrieval failed');
    });
  });
});
