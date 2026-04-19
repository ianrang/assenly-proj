import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

const mockOptionalAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: vi.fn().mockRejectedValue(new Error('unused')),
  optionalAuthenticateUser: (...args: unknown[]) => mockOptionalAuthenticateUser(...args),
}));

const mockCreateAuthenticatedClient = vi.fn();
const mockCreateServiceClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
  createServiceClient: () => mockCreateServiceClient(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockGetDomainHandler = vi.fn();
vi.mock('@/server/features/explore/domain-handlers', () => ({
  getDomainHandler: (...args: unknown[]) => mockGetDomainHandler(...args),
}));

const mockGetProfile = vi.fn();
vi.mock('@/server/features/profile/service', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

const mockCalculatePreferredIngredients = vi.fn();
const mockCalculateAvoidedIngredients = vi.fn();
const mockResolveConflicts = vi.fn();
vi.mock('@/server/features/beauty/derived', () => ({
  calculatePreferredIngredients: (...args: unknown[]) => mockCalculatePreferredIngredients(...args),
  calculateAvoidedIngredients: (...args: unknown[]) => mockCalculateAvoidedIngredients(...args),
  resolveConflicts: (...args: unknown[]) => mockResolveConflicts(...args),
}));

import { createApp } from '@/server/features/api/app';
import { registerExploreRoutes } from '@/server/features/api/routes/explore';

const MOCK_CLIENT = { _mock: true };

function createMockHandler(data: unknown[] = [], total = 0) {
  return {
    fetch: vi.fn().mockResolvedValue({ data, total }),
    score: vi.fn().mockReturnValue([]),
  };
}

describe('GET /api/explore', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerExploreRoutes(app);

    mockOptionalAuthenticateUser.mockResolvedValue(null);
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    mockCreateServiceClient.mockReturnValue(MOCK_CLIENT);
    mockCreateAuthenticatedClient.mockReturnValue(MOCK_CLIENT);
  });

  it('domain=products → 200 + data + meta', async () => {
    const mockData = [{ id: 'p1', name: { en: 'Serum' }, embedding: [0.1] }];
    const handler = createMockHandler(mockData, 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.meta).toMatchObject({
      total: 1,
      limit: 10,
      offset: 0,
      domain: 'products',
      scored: false,
    });
  });

  it('embedding 필드 제거', async () => {
    const mockData = [{ id: 'p1', embedding: [0.1, 0.2], name: { en: 'A' } }];
    const handler = createMockHandler(mockData, 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products');
    const json = await res.json();

    expect(json.data[0]).not.toHaveProperty('embedding');
  });

  it('domain 누락 → 400', async () => {
    const res = await app.request('/api/explore');
    expect(res.status).toBe(400);
  });

  it('유효하지 않은 domain → 400', async () => {
    mockGetDomainHandler.mockReturnValue(null);
    const res = await app.request('/api/explore?domain=invalid');
    expect(res.status).toBe(400);
  });

  it('limit/offset 페이지네이션 전달', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products&limit=5&offset=10');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.limit).toBe(5);
    expect(json.meta.offset).toBe(10);
    expect(handler.fetch).toHaveBeenCalledOnce();
    const fetchArgs = handler.fetch.mock.calls[0];
    expect(fetchArgs[2]).toMatchObject({ page: 3, pageSize: 5 });
  });

  it('limit 최대 50 제한', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products&limit=100');
    const json = await res.json();

    expect(json.meta.limit).toBe(50);
  });

  it('필터 파라미터 전달 — skin_types, category', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=products&skin_types=oily,dry&category=skincare');

    const fetchArgs = handler.fetch.mock.calls[0];
    const filters = fetchArgs[1] as Record<string, unknown>;
    expect(filters.skin_types).toEqual(['oily', 'dry']);
    expect(filters.category).toBe('skincare');
  });

  it('sort=relevance + 프로필 존재 → scoring 적용 (meta.scored=true)', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue({ id: 'u1', token: 'tok' });
    mockGetProfile.mockResolvedValue({
      user_id: 'u1',
      skin_types: ['oily'],
      hair_type: null,
      hair_concerns: [],
      country: null,
      language: 'en',
      age_range: null,
    });
    mockCalculatePreferredIngredients.mockReturnValue(['niacinamide']);
    mockCalculateAvoidedIngredients.mockReturnValue([]);
    mockResolveConflicts.mockReturnValue({ preferred: ['niacinamide'], avoided: [] });

    const rawData = [{ id: 'p1', name: { en: 'A' }, embedding: [0.1] }];
    const handler = createMockHandler(rawData, 1);
    const rankedItem = { item: { id: 'p1', score: 0.6, reasons: ['niacinamide'], warnings: [], is_highlighted: false }, rank: 1, is_highlighted: false };
    handler.score.mockReturnValue([rankedItem]);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products&sort=relevance');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.scored).toBe(true);
    expect(handler.score).toHaveBeenCalledOnce();
  });

  it('sort=rating → scoring 미적용 (meta.scored=false)', async () => {
    const handler = createMockHandler([{ id: 'p1' }], 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products&sort=rating');
    const json = await res.json();

    expect(json.meta.scored).toBe(false);
    expect(handler.score).not.toHaveBeenCalled();
  });

  it('sort=relevance + 프로필 미존재 → scoring 미적용', async () => {
    mockOptionalAuthenticateUser.mockResolvedValue({ id: 'u1', token: 'tok' });
    mockGetProfile.mockResolvedValue(null);

    const handler = createMockHandler([{ id: 'p1' }], 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products&sort=relevance');
    const json = await res.json();

    expect(json.meta.scored).toBe(false);
    expect(handler.score).not.toHaveBeenCalled();
  });

  it('fetch 에러 → 500', async () => {
    const handler = createMockHandler();
    handler.fetch.mockRejectedValue(new Error('DB error'));
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products');
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('INTERNAL_ERROR');
  });

  it('domain=treatments 정상 동작', async () => {
    const handler = createMockHandler([{ id: 't1', name: { en: 'Laser' } }], 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=treatments');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.domain).toBe('treatments');
  });

  it('domain=stores 정상 동작', async () => {
    const handler = createMockHandler([{ id: 's1' }], 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=stores');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.domain).toBe('stores');
  });

  it('domain=clinics 정상 동작', async () => {
    const handler = createMockHandler([{ id: 'c1' }], 1);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=clinics');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.domain).toBe('clinics');
  });

  it('concerns 필터 쉼표 구분 파싱', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=treatments&concerns=acne,wrinkles,pores');

    const filters = handler.fetch.mock.calls[0][1] as Record<string, unknown>;
    expect(filters.concerns).toEqual(['acne', 'wrinkles', 'pores']);
  });

  it('budget_max 숫자 필터 전달', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=products&budget_max=50000');

    const filters = handler.fetch.mock.calls[0][1] as Record<string, unknown>;
    expect(filters.budget_max).toBe(50000);
  });

  it('store_type 필터 전달 (stores)', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=stores&store_type=olive_young');

    const filters = handler.fetch.mock.calls[0][1] as Record<string, unknown>;
    expect(filters.store_type).toBe('olive_young');
  });

  it('english_support 필터 전달', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=clinics&english_support=fluent');

    const filters = handler.fetch.mock.calls[0][1] as Record<string, unknown>;
    expect(filters.english_support).toBe('fluent');
  });

  it('sort=price → sort field "price", order "asc"', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    await app.request('/api/explore?domain=products&sort=price');

    const sortArg = handler.fetch.mock.calls[0][3] as { field: string; order: string };
    expect(sortArg.field).toBe('price');
    expect(sortArg.order).toBe('asc');
  });

  it('결과 0건 → 빈 data 배열 + total=0', async () => {
    const handler = createMockHandler([], 0);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.meta.total).toBe(0);
  });

  it('복수 아이템에서 모든 embedding 필드 제거', async () => {
    const mockData = [
      { id: 'p1', embedding: [0.1], name: { en: 'A' } },
      { id: 'p2', embedding: [0.2], name: { en: 'B' } },
      { id: 'p3', embedding: [0.3], name: { en: 'C' } },
    ];
    const handler = createMockHandler(mockData, 3);
    mockGetDomainHandler.mockReturnValue(handler);

    const res = await app.request('/api/explore?domain=products');
    const json = await res.json();

    for (const item of json.data as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('embedding');
    }
    expect(json.data).toHaveLength(3);
  });
});
