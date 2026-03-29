import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

// db mock
const mockFindAllTreatments = vi.fn();
const mockFindTreatmentById = vi.fn();
vi.mock('@/server/features/repositories/treatment-repository', () => ({
  findAllTreatments: (...args: unknown[]) => mockFindAllTreatments(...args),
  findTreatmentById: (...args: unknown[]) => mockFindTreatmentById(...args),
}));

const mockCreateAuthenticatedClient = vi.fn();
const mockCreateServiceClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
  createServiceClient: () => mockCreateServiceClient(),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const MOCK_CLIENT = {};
const TEST_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('GET /api/treatments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('목록 반환 — data 배열 + meta (embedding 미포함)', async () => {
    const raw = [
      { id: 't1', name: { en: 'Laser' }, embedding: [0.1, 0.2], price_min: 50000 },
    ];
    mockFindAllTreatments.mockResolvedValue({ data: raw, total: 1 });

    const { GET } = await import('@/app/api/treatments/route');
    const res = await GET(new Request('http://localhost/api/treatments'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('embedding');
    expect(json.meta).toMatchObject({ total: 1, limit: 10, offset: 0 });
  });

  it('필터 파라미터 전달 — skin_types, concerns, budget_max, max_downtime, search', async () => {
    mockFindAllTreatments.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/treatments/route');
    const url = 'http://localhost/api/treatments?skin_types=oily&concerns=acne,pores&budget_max=100000&max_downtime=3&search=laser';
    await GET(new Request(url));

    expect(mockFindAllTreatments).toHaveBeenCalledWith(
      MOCK_CLIENT,
      expect.objectContaining({
        skin_types: ['oily'],
        concerns: ['acne', 'pores'],
        budget_max: 100000,
        max_downtime: 3,
        search: 'laser',
        status: 'active',
      }),
      expect.any(Object),
      { field: 'created_at', order: 'desc' },
    );
  });

  it('상세 반환 — embedding 미포함, clinics JOIN 포함', async () => {
    const raw = {
      id: TEST_UUID,
      name: { en: 'Filler' },
      embedding: [0.3],
      clinics: [{ clinic: { id: 'c1', name: { en: 'Clinic A' } } }],
    };
    mockFindTreatmentById.mockResolvedValue(raw);

    const { GET } = await import('@/app/api/treatments/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/treatments/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).not.toHaveProperty('embedding');
    expect(json.data.clinics).toBeDefined();
  });

  it('상세 — 존재하지 않는 id → 404', async () => {
    mockFindTreatmentById.mockResolvedValue(null);

    const { GET } = await import('@/app/api/treatments/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/treatments/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('잘못된 limit (음수) → 400 VALIDATION_FAILED', async () => {
    const { GET } = await import('@/app/api/treatments/route');
    const res = await GET(new Request('http://localhost/api/treatments?limit=-1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('인증 없어도 목록 정상 반환 (optional auth)', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockFindAllTreatments.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/treatments/route');
    const res = await GET(new Request('http://localhost/api/treatments'));

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
    expect(mockCreateAuthenticatedClient).not.toHaveBeenCalled();
  });
});
