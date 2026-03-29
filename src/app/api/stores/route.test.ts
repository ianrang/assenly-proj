import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

// db mock
const mockFindAllStores = vi.fn();
const mockFindStoreById = vi.fn();
vi.mock('@/server/features/repositories/store-repository', () => ({
  findAllStores: (...args: unknown[]) => mockFindAllStores(...args),
  findStoreById: (...args: unknown[]) => mockFindStoreById(...args),
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

describe('GET /api/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('목록 반환 — data 배열 + meta (embedding 미포함)', async () => {
    const raw = [
      { id: 's1', name: { en: 'Olive Young' }, embedding: [0.1], district: 'Myeongdong' },
    ];
    mockFindAllStores.mockResolvedValue({ data: raw, total: 1 });

    const { GET } = await import('@/app/api/stores/route');
    const res = await GET(new Request('http://localhost/api/stores'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('embedding');
    expect(json.meta).toMatchObject({ total: 1, limit: 10, offset: 0 });
  });

  it('query 파라미터 → search로 매핑', async () => {
    mockFindAllStores.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/stores/route');
    const url = 'http://localhost/api/stores?query=olive&district=Myeongdong&english_support=full';
    await GET(new Request(url));

    expect(mockFindAllStores).toHaveBeenCalledWith(
      MOCK_CLIENT,
      expect.objectContaining({
        search: 'olive',   // query → search 매핑 확인
        district: 'Myeongdong',
        english_support: 'full',
        status: 'active',
      }),
      expect.any(Object),
      { field: 'created_at', order: 'desc' },
    );
  });

  it('상세 반환 — embedding 미포함', async () => {
    const raw = { id: TEST_UUID, name: { en: 'Store Detail' }, embedding: [0.7], district: 'Hongdae' };
    mockFindStoreById.mockResolvedValue(raw);

    const { GET } = await import('@/app/api/stores/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/stores/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).not.toHaveProperty('embedding');
    expect(json.data.id).toBe(TEST_UUID);
  });

  it('상세 — 존재하지 않는 id → 404', async () => {
    mockFindStoreById.mockResolvedValue(null);

    const { GET } = await import('@/app/api/stores/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/stores/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('인증 없어도 목록 정상 반환 (optional auth)', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockFindAllStores.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/stores/route');
    const res = await GET(new Request('http://localhost/api/stores'));

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
    expect(mockCreateAuthenticatedClient).not.toHaveBeenCalled();
  });
});
