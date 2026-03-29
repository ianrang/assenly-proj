import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

// db mock
const mockFindAllClinics = vi.fn();
const mockFindClinicById = vi.fn();
vi.mock('@/server/features/repositories/clinic-repository', () => ({
  findAllClinics: (...args: unknown[]) => mockFindAllClinics(...args),
  findClinicById: (...args: unknown[]) => mockFindClinicById(...args),
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

describe('GET /api/clinics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('목록 반환 — data 배열 + meta (embedding 미포함)', async () => {
    const raw = [
      { id: 'c1', name: { en: 'Gangnam Clinic' }, embedding: [0.2], district: 'Gangnam' },
    ];
    mockFindAllClinics.mockResolvedValue({ data: raw, total: 1 });

    const { GET } = await import('@/app/api/clinics/route');
    const res = await GET(new Request('http://localhost/api/clinics'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('embedding');
    expect(json.meta).toMatchObject({ total: 1, limit: 10, offset: 0 });
  });

  it('query 파라미터 → search로 매핑', async () => {
    mockFindAllClinics.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/clinics/route');
    const url = 'http://localhost/api/clinics?query=derma&district=Gangnam&clinic_type=dermatology';
    await GET(new Request(url));

    expect(mockFindAllClinics).toHaveBeenCalledWith(
      MOCK_CLIENT,
      expect.objectContaining({
        search: 'derma',  // query → search 매핑 확인
        district: 'Gangnam',
        clinic_type: 'dermatology',
        status: 'active',
      }),
      expect.any(Object),
      { field: 'created_at', order: 'desc' },
    );
  });

  it('상세 반환 — embedding 미포함', async () => {
    const raw = {
      id: TEST_UUID,
      name: { en: 'Clinic Detail' },
      embedding: [0.9],
      foreigner_friendly: true,
      external_links: [],
    };
    mockFindClinicById.mockResolvedValue(raw);

    const { GET } = await import('@/app/api/clinics/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/clinics/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).not.toHaveProperty('embedding');
    expect(json.data.id).toBe(TEST_UUID);
  });

  it('상세 — 존재하지 않는 id → 404', async () => {
    mockFindClinicById.mockResolvedValue(null);

    const { GET } = await import('@/app/api/clinics/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/clinics/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('잘못된 limit (음수) → 400 VALIDATION_FAILED', async () => {
    const { GET } = await import('@/app/api/clinics/route');
    const res = await GET(new Request('http://localhost/api/clinics?limit=-1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('인증 없어도 목록 정상 반환 (optional auth)', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockFindAllClinics.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/clinics/route');
    const res = await GET(new Request('http://localhost/api/clinics'));

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
    expect(mockCreateAuthenticatedClient).not.toHaveBeenCalled();
  });
});
