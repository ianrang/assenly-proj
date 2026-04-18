import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/server/core/knowledge', () => ({
  embedQuery: vi.fn(),
}));

vi.mock('@/server/features/repositories/product-repository', () => ({
  findProductsByFilters: vi.fn(),
  matchProductsByVector: vi.fn(),
}));

vi.mock('@/server/features/repositories/treatment-repository', () => ({
  findTreatmentsByFilters: vi.fn(),
  matchTreatmentsByVector: vi.fn(),
}));

vi.mock('@/server/features/repositories/store-repository', () => ({
  findStoresByFilters: vi.fn(),
  matchStoresByVector: vi.fn(),
}));

vi.mock('@/server/features/repositories/clinic-repository', () => ({
  findClinicsByFilters: vi.fn(),
  matchClinicsByVector: vi.fn(),
}));

vi.mock('@/server/features/beauty/shopping', () => ({
  scoreProducts: vi.fn(),
}));

vi.mock('@/server/features/beauty/treatment', () => ({
  scoreTreatments: vi.fn(),
}));

vi.mock('@/server/features/beauty/store', () => ({
  scoreStores: vi.fn(),
}));

vi.mock('@/server/features/beauty/clinic', () => ({
  scoreClinics: vi.fn(),
}));

vi.mock('@/server/features/beauty/judgment', () => ({
  rank: vi.fn(),
}));

vi.mock('@/server/features/beauty/derived', () => ({
  calculatePreferredIngredients: vi.fn(),
  calculateAvoidedIngredients: vi.fn(),
  resolveConflicts: vi.fn(),
}));

import type { UserProfileVars, JourneyContextVars } from '@/shared/types/profile';
import type { Product, Treatment, Store, Clinic } from '@/shared/types/domain';

// --- Mock helpers ---

function createMockProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: { en: `Product ${id}` },
    description: null,
    brand_id: null,
    category: 'skincare',
    subcategory: null,
    skin_types: [],
    hair_types: [],
    concerns: [],
    key_ingredients: ['niacinamide'],
    price: 30000,
    price_min: null,
    price_max: null,
    price_currency: 'KRW',
    price_source: null,
    range_source: null,
    price_updated_at: null,
    price_source_url: null,
    volume: null,
    purchase_links: null,
    english_label: true,
    tourist_popular: false,
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    review_summary: null,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockTreatment(id: string, overrides: Partial<Treatment> = {}): Treatment {
  return {
    id,
    name: { en: `Treatment ${id}` },
    description: null,
    category: 'injection',
    subcategory: null,
    target_concerns: [],
    suitable_skin_types: [],
    price: null,
    price_min: 100000,
    price_max: 200000,
    price_currency: 'KRW',
    price_source: null,
    range_source: null,
    price_updated_at: null,
    price_source_url: null,
    duration_minutes: 30,
    downtime_days: 0,
    session_count: null,
    precautions: null,
    aftercare: null,
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockStore(id: string, overrides: Partial<Store> = {}): Store {
  return {
    id,
    name: { en: `Store ${id}` },
    description: null,
    country: 'KR',
    city: 'seoul',
    district: 'gangnam',
    location: null,
    address: null,
    operating_hours: null,
    english_support: 'good',
    store_type: 'cosmetics',
    tourist_services: [],
    payment_methods: [],
    nearby_landmarks: [],
    external_links: [],
    is_highlighted: false,
    highlight_badge: null,
    rating: 4.2,
    review_count: 100,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockClinic(id: string, overrides: Partial<Clinic> = {}): Clinic {
  return {
    id,
    name: { en: `Clinic ${id}` },
    description: null,
    country: 'KR',
    city: 'seoul',
    district: 'gangnam',
    location: null,
    address: null,
    operating_hours: null,
    english_support: 'fluent',
    clinic_type: 'dermatology',
    license_verified: true,
    consultation_type: [],
    foreigner_friendly: null,
    booking_url: null,
    external_links: [],
    is_highlighted: false,
    highlight_badge: null,
    rating: 4.5,
    review_count: 50,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockProfile(overrides: Partial<UserProfileVars> = {}): UserProfileVars {
  return {
    skin_types: ['dry'],
    hair_type: null,
    hair_concerns: [],
    country: 'US',
    language: 'en',
    age_range: '25-29',
    ...overrides,
  };
}

function createMockJourney(overrides: Partial<JourneyContextVars> = {}): JourneyContextVars {
  return {
    skin_concerns: [],
    interest_activities: ['shopping'],
    stay_days: 7,
    start_date: '2026-04-01',
    end_date: '2026-04-08',
    budget_level: 'moderate',
    travel_style: [],
    ...overrides,
  };
}

/**
 * Creates a mock Supabase client that handles junction table queries.
 * .from('product_stores').select(...).in(...) → resolves with junctionData
 */
function createMockSupabaseClient(junctionData: unknown[] | null = []) {
  const inFn = vi.fn().mockResolvedValue({ data: junctionData });
  const selectFn = vi.fn().mockReturnValue({ in: inFn });

  return {
    from: vi.fn().mockReturnValue({ select: selectFn }),
    _inFn: inFn,
    _selectFn: selectFn,
  };
}

// --- Import module under test ---

async function getHandler() {
  return import('@/server/features/chat/tools/search-handler');
}

// --- Test helpers ---

async function getKnowledge() {
  return import('@/server/core/knowledge');
}

async function getProductRepo() {
  return import('@/server/features/repositories/product-repository');
}

async function getTreatmentRepo() {
  return import('@/server/features/repositories/treatment-repository');
}

async function getBeautyShopping() {
  return import('@/server/features/beauty/shopping');
}

async function getBeautyTreatment() {
  return import('@/server/features/beauty/treatment');
}

async function getBeautyJudgment() {
  return import('@/server/features/beauty/judgment');
}

async function getBeautyDerived() {
  return import('@/server/features/beauty/derived');
}

async function getStoreRepo() {
  return import('@/server/features/repositories/store-repository');
}

async function getClinicRepo() {
  return import('@/server/features/repositories/clinic-repository');
}

async function getBeautyStore() {
  return import('@/server/features/beauty/store');
}

async function getBeautyClinic() {
  return import('@/server/features/beauty/clinic');
}

// --- Tests ---

describe('executeSearchBeautyData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: shopping — SQL search (no query) → products + stores
  it('1. shopping: query 없음 → SQL 검색(findByFilters), matchByVector 미호출', async () => {
    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([{ product_id: 'p1', store: { id: 's1', english_support: 'fluent' } }]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(productRepo.findProductsByFilters).toHaveBeenCalledTimes(1);
    expect(productRepo.matchProductsByVector).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.cards).toHaveLength(1);
  });

  // Test 2: shopping — vector search (with query) → embedQuery + matchByVector called
  it('2. shopping: query 있음 → embedQuery + matchByVector 호출', async () => {
    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];
    const embedding = [0.1, 0.2, 0.3];

    const knowledge = await getKnowledge();
    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(knowledge.embedQuery).mockResolvedValue(embedding);
    vi.mocked(productRepo.matchProductsByVector).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    await executeSearchBeautyData(
      { query: 'moisturizer for dry skin', domain: 'shopping', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(knowledge.embedQuery).toHaveBeenCalledWith('moisturizer for dry skin');
    expect(productRepo.matchProductsByVector).toHaveBeenCalledTimes(1);
    expect(productRepo.findProductsByFilters).not.toHaveBeenCalled();
  });

  // Test 3: shopping — embedding failure → SQL fallback
  it('3. shopping: embedQuery 실패 → SQL 폴백(findByFilters)', async () => {
    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const knowledge = await getKnowledge();
    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(knowledge.embedQuery).mockRejectedValue(new Error('Embedding API unavailable'));
    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'toner', domain: 'shopping', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(knowledge.embedQuery).toHaveBeenCalled();
    expect(productRepo.matchProductsByVector).not.toHaveBeenCalled();
    expect(productRepo.findProductsByFilters).toHaveBeenCalledTimes(1);
    expect(result.cards).toHaveLength(1);
  });

  // Test 4: shopping — empty result → { cards: [], total: 0 }
  it('4. shopping: 결과 없음 → { cards: [], total: 0 }', async () => {
    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue([]);
    vi.mocked(shopping.scoreProducts).mockReturnValue([]);
    vi.mocked(judgment.rank).mockReturnValue([]);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    expect(result.cards).toEqual([]);
    expect(result.total).toBe(0);
  });

  // Test 5: treatment — SQL search → treatments + clinics
  it('5. treatment: query 없음 → SQL 검색 + clinics 반환', async () => {
    const treatments = [createMockTreatment('t1')];
    const scoredItems = [{ id: 't1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const treatmentRepo = await getTreatmentRepo();
    const beautyTreatment = await getBeautyTreatment();
    const judgment = await getBeautyJudgment();

    vi.mocked(treatmentRepo.findTreatmentsByFilters).mockResolvedValue(treatments);
    vi.mocked(beautyTreatment.scoreTreatments).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const clinicData = [{ treatment_id: 't1', clinic: { id: 'c1', name: { en: 'Clinic A' }, english_support: 'fluent' } }];
    const client = createMockSupabaseClient(clinicData);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'treatment', limit: 3 },
      { client: client as never, profile: null, journey: createMockJourney(), preferences: [] },
    );

    expect(treatmentRepo.findTreatmentsByFilters).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.cards).toHaveLength(1);
    // Card should have clinics array
    expect((result.cards[0] as { clinics: unknown[] }).clinics).toBeDefined();
  });

  // Test 6: treatment — scoreTreatments downtime exclusion
  it('6. treatment: downtime 초과 시술 → scoreTreatments에서 제외됨', async () => {
    const treatments = [
      createMockTreatment('t1', { downtime_days: 0 }),
      createMockTreatment('t2', { downtime_days: 14 }), // Would be excluded for 7-day stay
    ];
    // scoreTreatments filters out t2 (excluded), only t1 remains
    const scoredItems = [{ id: 't1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const treatmentRepo = await getTreatmentRepo();
    const beautyTreatment = await getBeautyTreatment();
    const judgment = await getBeautyJudgment();

    vi.mocked(treatmentRepo.findTreatmentsByFilters).mockResolvedValue(treatments);
    vi.mocked(beautyTreatment.scoreTreatments).mockReturnValue(scoredItems); // only t1 scored
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'treatment' },
      {
        client: client as never,
        profile: null,
        journey: createMockJourney({ stay_days: 7 }),
        preferences: [],
      },
    );

    // scoreTreatments was called with journey dates
    expect(beautyTreatment.scoreTreatments).toHaveBeenCalledWith(
      treatments,
      '2026-04-08', // end_date
      7,            // stay_days
      expect.any(Date),
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ id: 't1' });
  });

  // Test 7: DB error → { cards: [], total: 0, error: 'DB_UNAVAILABLE' }
  it('7. DB 에러 → { cards: [], total: 0, error: \'DB_UNAVAILABLE\' }', async () => {
    const productRepo = await getProductRepo();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockRejectedValue(new Error('Connection failed'));
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    expect(result).toEqual({ cards: [], total: 0, error: 'DB_UNAVAILABLE' });
  });

  // Test 8: limit clamped to MAX_LIMIT (5)
  it('8. limit: 10 입력 → MAX_LIMIT(5)으로 클램프', async () => {
    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue([]);
    vi.mocked(shopping.scoreProducts).mockReturnValue([]);
    vi.mocked(judgment.rank).mockReturnValue([]);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    await executeSearchBeautyData(
      { query: '', domain: 'shopping', limit: 10 },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    // findProductsByFilters should be called with limit=5 (MAX_LIMIT)
    expect(productRepo.findProductsByFilters).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5, // clamped
    );
  });

  // Test 9: profile null (VP-3) → works with default scores
  it('9. profile null (VP-3) → 기본 점수로 정상 동작', async () => {
    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    // calculatePreferredIngredients called with empty skin_types array (VP-3 null-safe)
    expect(derived.calculatePreferredIngredients).toHaveBeenCalledWith([], [], []);
    expect(derived.calculateAvoidedIngredients).toHaveBeenCalledWith([], []);
    expect(result.cards).toHaveLength(1);
  });

  // Test 10: loadRelatedStores filters by english_support
  it('10. loadRelatedStores: english_support 필터 → 매칭 매장만 포함', async () => {
    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    // Two stores: one with 'fluent' english_support, one with 'none'
    const junctionData = [
      { product_id: 'p1', store: { id: 's1', english_support: 'fluent' } },
      { product_id: 'p1', store: { id: 's2', english_support: 'none' } },
    ];
    const client = createMockSupabaseClient(junctionData);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping', filters: { english_support: 'fluent' } },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    const card = result.cards[0] as { stores: { id: string }[] };
    expect(card.stores).toHaveLength(1);
    expect(card.stores[0].id).toBe('s1');
  });

  // --- Q-7 에러 로깅 테스트 (v1.1 — chat-quality-improvements.md §5.1) ---

  // Test 11: embedQuery 실패 시 [EMBED_FALLBACK] 경고 로깅
  it('11. embedQuery 실패 → [EMBED_FALLBACK] console.warn 호출 후 SQL 폴백', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const knowledge = await getKnowledge();
    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(knowledge.embedQuery).mockRejectedValue(new Error('Embedding API down'));
    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'serum', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[EMBED_FALLBACK]',
      expect.objectContaining({
        query: 'serum',
        error: 'Embedding API down',
      }),
    );
    expect(productRepo.findProductsByFilters).toHaveBeenCalled();
    expect(result.cards).toHaveLength(1);
    warnSpy.mockRestore();
  });

  // Test 12: loadRelatedStores 실패 시 [STORE_JOIN_FAILED] 에러 로깅
  it('12. loadRelatedStores 실패 → [STORE_JOIN_FAILED] console.error + 빈 stores 폴백', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const products = [createMockProduct('p1')];
    const scoredItems = [{ id: 'p1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const productRepo = await getProductRepo();
    const shopping = await getBeautyShopping();
    const judgment = await getBeautyJudgment();
    const derived = await getBeautyDerived();

    vi.mocked(productRepo.findProductsByFilters).mockResolvedValue(products);
    vi.mocked(shopping.scoreProducts).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);
    vi.mocked(derived.calculatePreferredIngredients).mockReturnValue([]);
    vi.mocked(derived.calculateAvoidedIngredients).mockReturnValue([]);
    vi.mocked(derived.resolveConflicts).mockReturnValue({ preferred: [], avoided: [] });

    // store 조회 실패 재현: .in()이 reject
    const inFn = vi.fn().mockRejectedValue(new Error('store join failed'));
    const selectFn = vi.fn().mockReturnValue({ in: inFn });
    const client = { from: vi.fn().mockReturnValue({ select: selectFn }) };

    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      '[STORE_JOIN_FAILED]',
      expect.objectContaining({
        productIds: ['p1'],
        error: 'store join failed',
      }),
    );
    // 핵심 데이터는 여전히 반환 (빈 stores 배열)
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0] as { stores: unknown[] };
    expect(card.stores).toEqual([]);
    errorSpy.mockRestore();
  });

  // Test 13: loadRelatedClinics 실패 시 [CLINIC_JOIN_FAILED] 에러 로깅
  it('13. loadRelatedClinics 실패 → [CLINIC_JOIN_FAILED] console.error + 빈 clinics 폴백', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const treatments = [createMockTreatment('t1')];
    const scoredItems = [{ id: 't1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const treatmentRepo = await getTreatmentRepo();
    const beautyTreatment = await getBeautyTreatment();
    const judgment = await getBeautyJudgment();

    vi.mocked(treatmentRepo.findTreatmentsByFilters).mockResolvedValue(treatments);
    vi.mocked(beautyTreatment.scoreTreatments).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    // clinic 조회 실패 재현
    const inFn = vi.fn().mockRejectedValue(new Error('clinic join failed'));
    const selectFn = vi.fn().mockReturnValue({ in: inFn });
    const client = { from: vi.fn().mockReturnValue({ select: selectFn }) };

    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'treatment' },
      { client: client as never, profile: null, journey: createMockJourney(), preferences: [] },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      '[CLINIC_JOIN_FAILED]',
      expect.objectContaining({
        treatmentIds: ['t1'],
        error: 'clinic join failed',
      }),
    );
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0] as { clinics: unknown[] };
    expect(card.clinics).toEqual([]);
    errorSpy.mockRestore();
  });

  // --- store 도메인 테스트 ---

  // Test 14: store — vector search (with query) → embedQuery + matchByVector 호출
  it('14. store: query 있음 → embedQuery + matchStoresByVector 호출', async () => {
    const stores = [createMockStore('s1')];
    const scoredItems = [{ id: 's1', score: 0.7, reasons: ['Good English support'], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];
    const embedding = [0.1, 0.2, 0.3];

    const knowledge = await getKnowledge();
    const storeRepo = await getStoreRepo();
    const beautyStore = await getBeautyStore();
    const judgment = await getBeautyJudgment();

    vi.mocked(knowledge.embedQuery).mockResolvedValue(embedding);
    vi.mocked(storeRepo.matchStoresByVector).mockResolvedValue(stores);
    vi.mocked(beautyStore.scoreStores).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'Olive Young near Gangnam', domain: 'store', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(knowledge.embedQuery).toHaveBeenCalledWith('Olive Young near Gangnam');
    expect(storeRepo.matchStoresByVector).toHaveBeenCalledTimes(1);
    expect(storeRepo.findStoresByFilters).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ id: 's1', reasons: ['Good English support'] });
  });

  // Test 15: store — embedding 실패 → SQL 폴백
  it('15. store: embedQuery 실패 → SQL 폴백(findStoresByFilters)', async () => {
    const stores = [createMockStore('s1')];
    const scoredItems = [{ id: 's1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const knowledge = await getKnowledge();
    const storeRepo = await getStoreRepo();
    const beautyStore = await getBeautyStore();
    const judgment = await getBeautyJudgment();

    vi.mocked(knowledge.embedQuery).mockRejectedValue(new Error('Embedding API down'));
    vi.mocked(storeRepo.findStoresByFilters).mockResolvedValue(stores);
    vi.mocked(beautyStore.scoreStores).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'duty free shop', domain: 'store' },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(storeRepo.matchStoresByVector).not.toHaveBeenCalled();
    expect(storeRepo.findStoresByFilters).toHaveBeenCalledTimes(1);
    expect(result.cards).toHaveLength(1);
    warnSpy.mockRestore();
  });

  // Test 16: store — query 없음 → SQL 검색
  it('16. store: query 없음 → SQL 검색(findStoresByFilters)', async () => {
    const stores = [createMockStore('s1')];
    const scoredItems = [{ id: 's1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const storeRepo = await getStoreRepo();
    const beautyStore = await getBeautyStore();
    const judgment = await getBeautyJudgment();

    vi.mocked(storeRepo.findStoresByFilters).mockResolvedValue(stores);
    vi.mocked(beautyStore.scoreStores).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'store', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(storeRepo.findStoresByFilters).toHaveBeenCalledTimes(1);
    expect(storeRepo.matchStoresByVector).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
  });

  // --- clinic 도메인 테스트 ---

  // Test 17: clinic — vector search (with query) → embedQuery + matchByVector 호출
  it('17. clinic: query 있음 → embedQuery + matchClinicsByVector 호출', async () => {
    const clinics = [createMockClinic('c1')];
    const scoredItems = [{ id: 'c1', score: 0.8, reasons: ['Licensed and verified clinic'], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];
    const embedding = [0.1, 0.2, 0.3];

    const knowledge = await getKnowledge();
    const clinicRepo = await getClinicRepo();
    const beautyClinic = await getBeautyClinic();
    const judgment = await getBeautyJudgment();

    vi.mocked(knowledge.embedQuery).mockResolvedValue(embedding);
    vi.mocked(clinicRepo.matchClinicsByVector).mockResolvedValue(clinics);
    vi.mocked(beautyClinic.scoreClinics).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'English-speaking dermatology clinic in Gangnam', domain: 'clinic', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(knowledge.embedQuery).toHaveBeenCalledWith('English-speaking dermatology clinic in Gangnam');
    expect(clinicRepo.matchClinicsByVector).toHaveBeenCalledTimes(1);
    expect(clinicRepo.findClinicsByFilters).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ id: 'c1', reasons: ['Licensed and verified clinic'] });
  });

  // Test 18: clinic — embedding 실패 → SQL 폴백
  it('18. clinic: embedQuery 실패 → SQL 폴백(findClinicsByFilters)', async () => {
    const clinics = [createMockClinic('c1')];
    const scoredItems = [{ id: 'c1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const knowledge = await getKnowledge();
    const clinicRepo = await getClinicRepo();
    const beautyClinic = await getBeautyClinic();
    const judgment = await getBeautyJudgment();

    vi.mocked(knowledge.embedQuery).mockRejectedValue(new Error('Embedding API down'));
    vi.mocked(clinicRepo.findClinicsByFilters).mockResolvedValue(clinics);
    vi.mocked(beautyClinic.scoreClinics).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: 'best skin clinic', domain: 'clinic' },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(clinicRepo.matchClinicsByVector).not.toHaveBeenCalled();
    expect(clinicRepo.findClinicsByFilters).toHaveBeenCalledTimes(1);
    expect(result.cards).toHaveLength(1);
    warnSpy.mockRestore();
  });

  // Test 19: clinic — query 없음 → SQL 검색
  it('19. clinic: query 없음 → SQL 검색(findClinicsByFilters)', async () => {
    const clinics = [createMockClinic('c1')];
    const scoredItems = [{ id: 'c1', score: 0.5, reasons: [], warnings: [], is_highlighted: false }];
    const rankedItems = [{ item: scoredItems[0], rank: 1, is_highlighted: false }];

    const clinicRepo = await getClinicRepo();
    const beautyClinic = await getBeautyClinic();
    const judgment = await getBeautyJudgment();

    vi.mocked(clinicRepo.findClinicsByFilters).mockResolvedValue(clinics);
    vi.mocked(beautyClinic.scoreClinics).mockReturnValue(scoredItems);
    vi.mocked(judgment.rank).mockReturnValue(rankedItems);

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'clinic', limit: 3 },
      { client: client as never, profile: createMockProfile(), journey: null, preferences: [] },
    );

    expect(clinicRepo.findClinicsByFilters).toHaveBeenCalledTimes(1);
    expect(clinicRepo.matchClinicsByVector).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
  });
});
