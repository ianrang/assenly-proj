import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerProductRoutes } from '@/server/features/api/routes/products';
import { registerTreatmentRoutes } from '@/server/features/api/routes/treatments';
import { registerStoreRoutes } from '@/server/features/api/routes/stores';
import { registerClinicRoutes } from '@/server/features/api/routes/clinics';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

// 데이터 존재 확인 — 파이프라인 미실행 시 전체 스킵
async function checkDataExists(): Promise<boolean> {
  const client = createVerifyClient();
  const { count } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  return (count ?? 0) > 0;
}

const hasData = await checkDataExists();

describe.skipIf(!hasData)('Search filters (integration)', () => {
  const app = createApp();

  beforeAll(() => {
    registerProductRoutes(app);
    registerTreatmentRoutes(app);
    registerStoreRoutes(app);
    registerClinicRoutes(app);
  });

  // ============================================================
  // 공통 헬퍼
  // ============================================================

  async function fetchList(path: string) {
    const res = await app.request(path);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(typeof json.meta.total).toBe('number');

    // api-spec §2.2: embedding 필드 제외 검증
    if (json.data.length > 0) {
      expect(json.data[0]).not.toHaveProperty('embedding');
    }

    return json as { data: Record<string, unknown>[]; meta: { total: number; limit: number; offset: number } };
  }

  /**
   * name 필드(JSONB {ko, en})에서 텍스트 포함 여부 확인.
   * ILIKE 검색이므로 case-insensitive 비교.
   */
  function nameContains(item: Record<string, unknown>, text: string): boolean {
    const name = item.name as { ko?: string; en?: string } | undefined;
    if (!name) return false;
    const lower = text.toLowerCase();
    return (name.ko?.toLowerCase().includes(lower) ?? false)
      || (name.en?.toLowerCase().includes(lower) ?? false);
  }

  // ============================================================
  // Products
  // ============================================================

  describe('GET /api/products — filters', () => {
    let baselineTotal: number;

    it('P-S01: 필터 없음 → 기준값', async () => {
      const json = await fetchList('/api/products?limit=50');
      baselineTotal = json.meta.total;
      expect(baselineTotal).toBeGreaterThan(0);
    });

    it('P-S02: skin_types=oily → 배열 overlap 필터', async () => {
      const json = await fetchList('/api/products?skin_types=oily&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.skin_types as string[]).toContain('oily');
      }
    });

    it('P-S03: concerns=acne,wrinkles → 다중값 배열 overlap + CSV 파싱', async () => {
      const json = await fetchList('/api/products?concerns=acne,wrinkles&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        const concerns = item.concerns as string[];
        const hasOverlap = concerns.includes('acne') || concerns.includes('wrinkles');
        expect(hasOverlap).toBe(true);
      }
    });

    it('P-S04: category=skincare → 정확 매치', async () => {
      const json = await fetchList('/api/products?category=skincare&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.category).toBe('skincare');
      }
    });

    it('P-S05: budget_max=15000 → 수치 ≤ 필터', async () => {
      const json = await fetchList('/api/products?budget_max=15000&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.price as number).toBeLessThanOrEqual(15000);
      }
    });

    it('P-S06: search=serum → 영문 ILIKE', async () => {
      const json = await fetchList('/api/products?search=serum&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, 'serum')).toBe(true);
      }
    });

    it('P-S07: search=이니스프리 → 한글 ILIKE', async () => {
      const json = await fetchList('/api/products?search=이니스프리&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, '이니스프리')).toBe(true);
      }
    });

    it('P-C01: skin_types=dry & category=skincare → A+E 복합', async () => {
      const json = await fetchList('/api/products?skin_types=dry&category=skincare&limit=50');
      for (const item of json.data) {
        expect(item.skin_types as string[]).toContain('dry');
        expect(item.category).toBe('skincare');
      }
    });

    it('P-C02: skin_types=oily & budget_max=20000 → A+N 복합', async () => {
      const json = await fetchList('/api/products?skin_types=oily&budget_max=20000&limit=50');
      for (const item of json.data) {
        expect(item.skin_types as string[]).toContain('oily');
        expect(item.price as number).toBeLessThanOrEqual(20000);
      }
    });

    it('P-C03: category=skincare & search=cream → E+T 복합', async () => {
      const json = await fetchList('/api/products?category=skincare&search=cream&limit=50');
      for (const item of json.data) {
        expect(item.category).toBe('skincare');
        expect(nameContains(item, 'cream')).toBe(true);
      }
    });

    it('P-Z01: category=tools & budget_max=1 → 불가능 필터', async () => {
      const json = await fetchList('/api/products?category=tools&budget_max=1');
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });

    it('P-Z02: search=zzz_nonexistent_xyz → 존재하지 않는 검색어', async () => {
      const json = await fetchList('/api/products?search=zzz_nonexistent_xyz');
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });
  });

  // ============================================================
  // Treatments
  // ============================================================

  describe('GET /api/treatments — filters', () => {
    let baselineTotal: number;

    it('T-S01: 필터 없음 → 기준값', async () => {
      const json = await fetchList('/api/treatments?limit=50');
      baselineTotal = json.meta.total;
      expect(baselineTotal).toBeGreaterThan(0);
    });

    it('T-S02: skin_types=sensitive → suitable_skin_types 배열 overlap', async () => {
      const json = await fetchList('/api/treatments?skin_types=sensitive&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.suitable_skin_types as string[]).toContain('sensitive');
      }
    });

    it('T-S03: concerns=pores → target_concerns 배열 overlap', async () => {
      const json = await fetchList('/api/treatments?concerns=pores&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.target_concerns as string[]).toContain('pores');
      }
    });

    it('T-S04: category=laser → 정확 매치', async () => {
      const json = await fetchList('/api/treatments?category=laser&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.category).toBe('laser');
      }
    });

    it('T-S05: budget_max=100000 → price_max ≤', async () => {
      const json = await fetchList('/api/treatments?budget_max=100000&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.price_max as number).toBeLessThanOrEqual(100000);
      }
    });

    it('T-S06: max_downtime=1 → downtime_days ≤', async () => {
      const json = await fetchList('/api/treatments?max_downtime=1&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.downtime_days as number).toBeLessThanOrEqual(1);
      }
    });

    it('T-S07: search=laser → 영문 ILIKE', async () => {
      const json = await fetchList('/api/treatments?search=laser&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, 'laser')).toBe(true);
      }
    });

    it('T-S08: search=레이저 → 한글 ILIKE', async () => {
      const json = await fetchList('/api/treatments?search=레이저&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, '레이저')).toBe(true);
      }
    });

    it('T-C01: skin_types=oily & max_downtime=3 → A+N 복합', async () => {
      const json = await fetchList('/api/treatments?skin_types=oily&max_downtime=3&limit=50');
      for (const item of json.data) {
        expect(item.suitable_skin_types as string[]).toContain('oily');
        expect(item.downtime_days as number).toBeLessThanOrEqual(3);
      }
    });

    it('T-C02: category=injection & budget_max=200000 → E+N 복합', async () => {
      const json = await fetchList('/api/treatments?category=injection&budget_max=200000&limit=50');
      for (const item of json.data) {
        expect(item.category).toBe('injection');
        expect(item.price_max as number).toBeLessThanOrEqual(200000);
      }
    });

    it('T-C03: concerns=acne & category=facial & max_downtime=7 → A+E+N 3중', async () => {
      const json = await fetchList('/api/treatments?concerns=acne&category=facial&max_downtime=7&limit=50');
      for (const item of json.data) {
        expect(item.target_concerns as string[]).toContain('acne');
        expect(item.category).toBe('facial');
        expect(item.downtime_days as number).toBeLessThanOrEqual(7);
      }
    });

    it('T-Z01: category=body & budget_max=1 → 불가능 필터', async () => {
      const json = await fetchList('/api/treatments?category=body&budget_max=1');
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });
  });

  // ============================================================
  // Stores
  // ============================================================

  describe('GET /api/stores — filters', () => {
    let baselineTotal: number;

    it('S-S01: 필터 없음 → 기준값', async () => {
      const json = await fetchList('/api/stores?limit=50');
      baselineTotal = json.meta.total;
      expect(baselineTotal).toBeGreaterThan(0);
    });

    it('S-S02: district=gangnam → 정확 매치', async () => {
      const json = await fetchList('/api/stores?district=gangnam&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.district).toBe('gangnam');
      }
    });

    it('S-S03: store_type=olive_young → 정확 매치', async () => {
      const json = await fetchList('/api/stores?store_type=olive_young&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.store_type).toBe('olive_young');
      }
    });

    it('S-S04: english_support=good → 정확 매치', async () => {
      const json = await fetchList('/api/stores?english_support=good&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.english_support).toBe('good');
      }
    });

    it('S-S05: query=olive → 영문 ILIKE', async () => {
      const json = await fetchList('/api/stores?query=olive&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, 'olive')).toBe(true);
      }
    });

    it('S-S06: query=올리브영 → 한글 ILIKE', async () => {
      const json = await fetchList('/api/stores?query=올리브영&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, '올리브영')).toBe(true);
      }
    });

    it('S-C01: district=gangnam & store_type=olive_young → E+E 복합', async () => {
      const json = await fetchList('/api/stores?district=gangnam&store_type=olive_young&limit=50');
      for (const item of json.data) {
        expect(item.district).toBe('gangnam');
        expect(item.store_type).toBe('olive_young');
      }
    });

    it('S-C02: district=myeongdong & query=다이소 → E+T 복합 (한글)', async () => {
      const json = await fetchList('/api/stores?district=myeongdong&query=다이소&limit=50');
      for (const item of json.data) {
        expect(item.district).toBe('myeongdong');
        expect(nameContains(item, '다이소')).toBe(true);
      }
    });

    it('S-Z01: district=gangnam & store_type=pharmacy & english_support=good → 불가능', async () => {
      const json = await fetchList('/api/stores?district=gangnam&store_type=pharmacy&english_support=good');
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });
  });

  // ============================================================
  // Clinics
  // ============================================================

  describe('GET /api/clinics — filters', () => {
    let baselineTotal: number;

    it('C-S01: 필터 없음 → 기준값', async () => {
      const json = await fetchList('/api/clinics?limit=50');
      baselineTotal = json.meta.total;
      expect(baselineTotal).toBeGreaterThan(0);
    });

    it('C-S02: district=gangnam → 정확 매치', async () => {
      const json = await fetchList('/api/clinics?district=gangnam&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.district).toBe('gangnam');
      }
    });

    it('C-S03: clinic_type=dermatology → 정확 매치', async () => {
      const json = await fetchList('/api/clinics?clinic_type=dermatology&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(item.clinic_type).toBe('dermatology');
      }
    });

    it('C-S04: english_support=none → 모든 항목 조건 충족', async () => {
      const json = await fetchList('/api/clinics?english_support=none&limit=50');
      // 현재 전체 데이터가 none이므로 count 감소 미검증 — 필터 적용만 확인
      for (const item of json.data) {
        expect(item.english_support).toBe('none');
      }
    });

    it('C-S05: query=derma → 영문 ILIKE', async () => {
      const json = await fetchList('/api/clinics?query=derma&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, 'derma')).toBe(true);
      }
    });

    it('C-S06: query=피부과 → 한글 ILIKE', async () => {
      const json = await fetchList('/api/clinics?query=피부과&limit=50');
      expect(json.meta.total).toBeLessThan(baselineTotal);
      for (const item of json.data) {
        expect(nameContains(item, '피부과')).toBe(true);
      }
    });

    it('C-C01: district=gangnam & clinic_type=dermatology → E+E 복합', async () => {
      const json = await fetchList('/api/clinics?district=gangnam&clinic_type=dermatology&limit=50');
      for (const item of json.data) {
        expect(item.district).toBe('gangnam');
        expect(item.clinic_type).toBe('dermatology');
      }
    });

    it('C-Z01: query=zzz_nonexistent_xyz → 존재하지 않는 검색어', async () => {
      const json = await fetchList('/api/clinics?query=zzz_nonexistent_xyz');
      expect(json.data).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });
  });

  // ============================================================
  // NEW-21 WS1: 프로필 → 검색 필터 통합 테스트 (4건)
  // 온보딩 프로필 값이 검색 필터 파라미터로 올바르게 작동하는지 검증.
  // 파이프라인: OnboardingChips → POST /api/profile/onboarding → 동일 값으로 검색
  // ============================================================

  // ============================================================
  // NEW-21 WS1: 프로필 → 검색 필터 통합 테스트 (4건)
  // 온보딩 프로필 값이 검색 필터 파라미터로 올바르게 작동하는지 검증.
  // 파이프라인: OnboardingChips → POST /api/profile/onboarding → 동일 값으로 검색
  // 별도 app 인스턴스 사용 — Hono SmartRouter는 첫 request 후 route 추가 불가.
  // ============================================================

  describe('Profile → search filter pipeline', () => {
    const pfApp = createApp();
    let profileUser: TestSession;

    beforeAll(async () => {
      registerProductRoutes(pfApp);
      registerTreatmentRoutes(pfApp);
      registerProfileRoutes(pfApp);

      profileUser = await createRegisteredTestUser();

      // 온보딩 완료: skin_types=[sensitive], skin_concerns=[redness, dryness]
      const res = await pfApp.request(
        '/api/profile/onboarding',
        jsonRequest('POST', profileUser.token, {
          skin_types: ['sensitive'],
          skin_concerns: ['redness', 'dryness'],
        }),
      );
      expect(res.status).toBe(201);
    });

    afterAll(async () => {
      await cleanupTestUser(profileUser.userId);
    });

    async function pfFetchList(path: string) {
      const res = await pfApp.request(path);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
      return json as { data: Record<string, unknown>[]; meta: { total: number } };
    }

    it('PF-01: 프로필 skin_types → 제품 skin_types 필터 정합', async () => {
      const json = await pfFetchList('/api/products?skin_types=sensitive&limit=50');
      expect(json.meta.total).toBeGreaterThan(0);
      for (const item of json.data) {
        expect(item.skin_types as string[]).toContain('sensitive');
      }
    });

    it('PF-02: 프로필 skin_concerns → 제품 concerns 필터 정합', async () => {
      const json = await pfFetchList('/api/products?concerns=redness&limit=50');
      expect(json.meta.total).toBeGreaterThan(0);
      for (const item of json.data) {
        expect(item.concerns as string[]).toContain('redness');
      }
    });

    it('PF-03: 프로필 skin_types → 시술 skin_types 필터 정합', async () => {
      const json = await pfFetchList('/api/treatments?skin_types=sensitive&limit=50');
      expect(json.meta.total).toBeGreaterThan(0);
      for (const item of json.data) {
        expect(item.suitable_skin_types as string[]).toContain('sensitive');
      }
    });

    it('PF-04: 프로필 값 복합 필터 (skin_types + concerns) → 교집합', async () => {
      const json = await pfFetchList('/api/products?skin_types=sensitive&concerns=dryness&limit=50');
      for (const item of json.data) {
        expect(item.skin_types as string[]).toContain('sensitive');
        expect(item.concerns as string[]).toContain('dryness');
      }
    });
  });
});
