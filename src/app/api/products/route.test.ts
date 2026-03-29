import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

// db mock
const mockFindAllProducts = vi.fn();
const mockFindProductById = vi.fn();
vi.mock('@/server/features/repositories/product-repository', () => ({
  findAllProducts: (...args: unknown[]) => mockFindAllProducts(...args),
  findProductById: (...args: unknown[]) => mockFindProductById(...args),
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

describe('GET /api/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('목록 반환 — data 배열 + meta (embedding 미포함)', async () => {
    const raw = [
      { id: 'p1', name: { en: 'Test' }, embedding: [0.1, 0.2], price: 10000 },
    ];
    mockFindAllProducts.mockResolvedValue({ data: raw, total: 1 });

    const { GET } = await import('@/app/api/products/route');
    const res = await GET(new Request('http://localhost/api/products'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('embedding');
    expect(json.meta).toMatchObject({ total: 1, limit: 10, offset: 0 });
  });

  it('필터 파라미터 전달 — skin_types, concerns, budget_max, search', async () => {
    mockFindAllProducts.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/products/route');
    const url = 'http://localhost/api/products?skin_types=dry,oily&concerns=acne&budget_max=20000&search=serum&limit=5&offset=10';
    await GET(new Request(url));

    expect(mockFindAllProducts).toHaveBeenCalledWith(
      MOCK_CLIENT,
      expect.objectContaining({
        skin_types: ['dry', 'oily'],
        concerns: ['acne'],
        budget_max: 20000,
        search: 'serum',
        status: 'active',
      }),
      { page: 3, pageSize: 5 },
      { field: 'created_at', order: 'desc' },
    );
  });

  it('상세 반환 — embedding 미포함', async () => {
    const raw = { id: TEST_UUID, name: { en: 'Detail' }, embedding: [0.5], brand: { id: 'b1' } };
    mockFindProductById.mockResolvedValue(raw);

    const { GET } = await import('@/app/api/products/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/products/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).not.toHaveProperty('embedding');
    expect(json.data.id).toBe(TEST_UUID);
  });

  it('상세 — 존재하지 않는 id → 404', async () => {
    mockFindProductById.mockResolvedValue(null);

    const { GET } = await import('@/app/api/products/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/products/${TEST_UUID}`),
      { params: Promise.resolve({ id: TEST_UUID }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('잘못된 limit (음수) → 400 VALIDATION_FAILED', async () => {
    const { GET } = await import('@/app/api/products/route');
    const res = await GET(new Request('http://localhost/api/products?limit=-1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('인증 없어도 목록 정상 반환 (optional auth)', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockFindAllProducts.mockResolvedValue({ data: [], total: 0 });

    const { GET } = await import('@/app/api/products/route');
    const res = await GET(new Request('http://localhost/api/products'));

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
    expect(mockCreateAuthenticatedClient).not.toHaveBeenCalled();
  });
});
