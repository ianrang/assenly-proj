import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Core auth mock (optional) ─────────────────────────────────
const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: vi.fn().mockRejectedValue(new Error('unused')),
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

// ── Core db mock ──────────────────────────────────────────────
const mockCreateAuthenticatedClient = vi.fn();
const mockCreateServiceClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(),
}));

// ── Rate limit mock ───────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Repository mocks ──────────────────────────────────────────
const mockFindAllProducts = vi.fn();
const mockFindProductById = vi.fn();
vi.mock('@/server/features/repositories/product-repository', () => ({
  findAllProducts: (...args: unknown[]) => mockFindAllProducts(...args),
  findProductById: (...args: unknown[]) => mockFindProductById(...args),
}));

const mockFindAllTreatments = vi.fn();
const mockFindTreatmentById = vi.fn();
vi.mock('@/server/features/repositories/treatment-repository', () => ({
  findAllTreatments: (...args: unknown[]) => mockFindAllTreatments(...args),
  findTreatmentById: (...args: unknown[]) => mockFindTreatmentById(...args),
}));

const mockFindAllStores = vi.fn();
const mockFindStoreById = vi.fn();
vi.mock('@/server/features/repositories/store-repository', () => ({
  findAllStores: (...args: unknown[]) => mockFindAllStores(...args),
  findStoreById: (...args: unknown[]) => mockFindStoreById(...args),
}));

const mockFindAllClinics = vi.fn();
const mockFindClinicById = vi.fn();
vi.mock('@/server/features/repositories/clinic-repository', () => ({
  findAllClinics: (...args: unknown[]) => mockFindAllClinics(...args),
  findClinicById: (...args: unknown[]) => mockFindClinicById(...args),
}));

import { createApp } from '@/server/features/api/app';
import { registerProductRoutes } from '@/server/features/api/routes/products';

const MOCK_CLIENT = { _mock: true };
const TEST_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('GET /api/products (domain-read)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerProductRoutes(app);

    // default: no user (optional auth)
    mockOptionalAuthenticateUser.mockResolvedValue(null);

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });

    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('products 목록 반환 — embedding 미포함 + meta', async () => {
    const rawProducts = [
      { id: 'p1', name: { en: 'Serum' }, embedding: [0.1, 0.2], price: 10000 },
    ];
    mockFindAllProducts.mockResolvedValue({ data: rawProducts, total: 1 });

    const res = await app.request('/api/products');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('embedding');
    expect(json.meta).toMatchObject({ total: 1, limit: 10, offset: 0 });
  });

  it('products/:id 상세 반환 — embedding 미포함', async () => {
    const rawProduct = { id: TEST_UUID, name: { en: 'Detail' }, embedding: [0.5], brand: { id: 'b1' } };
    mockFindProductById.mockResolvedValue(rawProduct);

    const res = await app.request(`/api/products/${TEST_UUID}`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(TEST_UUID);
    expect(json.data).not.toHaveProperty('embedding');
  });

  it('products/:id 존재하지 않음 → 404 NOT_FOUND', async () => {
    mockFindProductById.mockResolvedValue(null);

    const res = await app.request(`/api/products/${TEST_UUID}`);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('embedding 필드 제외 확인 — 복수 상품에 embedding 없음', async () => {
    const rawProducts = [
      { id: 'p1', embedding: [0.1], name: { en: 'A' } },
      { id: 'p2', embedding: [0.2], name: { en: 'B' } },
    ];
    mockFindAllProducts.mockResolvedValue({ data: rawProducts, total: 2 });

    const res = await app.request('/api/products');
    const json = await res.json();

    for (const item of json.data as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('embedding');
    }
  });

  it('인증 없어도 목록 정상 반환 (optional auth) — serviceClient 사용', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockFindAllProducts.mockResolvedValue({ data: [], total: 0 });

    const res = await app.request('/api/products');

    expect(res.status).toBe(200);
    expect(mockCreateServiceClient).toHaveBeenCalled();
    expect(mockCreateAuthenticatedClient).not.toHaveBeenCalled();
  });
});
