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

vi.mock('@/server/features/beauty/shopping', () => ({
  scoreProducts: vi.fn(),
}));

vi.mock('@/server/features/beauty/treatment', () => ({
  scoreTreatments: vi.fn(),
}));

vi.mock('@/server/features/beauty/judgment', () => ({
  rank: vi.fn(),
}));

vi.mock('@/server/features/beauty/derived', () => ({
  calculatePreferredIngredients: vi.fn(),
  calculateAvoidedIngredients: vi.fn(),
}));

import type { UserProfileVars, JourneyContextVars, LearnedPreference } from '@/shared/types/profile';
import type { Product, Treatment } from '@/shared/types/domain';

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
    price_min: 100000,
    price_max: 200000,
    price_currency: 'KRW',
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

function createMockProfile(overrides: Partial<UserProfileVars> = {}): UserProfileVars {
  return {
    skin_type: 'dry',
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

    const client = createMockSupabaseClient([{ product_id: 'p1', store: { id: 's1', english_support: 'full' } }]);
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

    const clinicData = [{ treatment_id: 't1', clinic: { id: 'c1', name: { en: 'Clinic A' }, english_support: 'full' } }];
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

    const client = createMockSupabaseClient([]);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping' },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    // calculatePreferredIngredients called with null skinType
    expect(derived.calculatePreferredIngredients).toHaveBeenCalledWith(null, [], []);
    expect(derived.calculateAvoidedIngredients).toHaveBeenCalledWith(null, []);
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

    // Two stores: one with 'full' english_support, one with 'none'
    const junctionData = [
      { product_id: 'p1', store: { id: 's1', english_support: 'full' } },
      { product_id: 'p1', store: { id: 's2', english_support: 'none' } },
    ];
    const client = createMockSupabaseClient(junctionData);
    const { executeSearchBeautyData } = await getHandler();

    const result = await executeSearchBeautyData(
      { query: '', domain: 'shopping', filters: { english_support: 'full' } },
      { client: client as never, profile: null, journey: null, preferences: [] },
    );

    const card = result.cards[0] as { stores: { id: string }[] };
    expect(card.stores).toHaveLength(1);
    expect(card.stores[0].id).toBe('s1');
  });
});
