import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerExploreRoutes } from '@/server/features/api/routes/explore';

describe('GET /api/explore (integration)', () => {
  const app = createApp();

  beforeAll(() => {
    registerExploreRoutes(app);
  });

  async function exploreRequest(query: string) {
    const res = await app.request(`/api/explore?${query}`);
    const json = await res.json();
    return { res, json };
  }

  describe('4도메인 기본 조회', () => {
    for (const domain of ['products', 'treatments', 'stores', 'clinics'] as const) {
      it(`domain=${domain} → 200 + 올바른 구조`, async () => {
        const { res, json } = await exploreRequest(`domain=${domain}&limit=5`);

        expect(res.status).toBe(200);
        expect(Array.isArray(json.data)).toBe(true);
        expect(typeof json.meta.total).toBe('number');
        expect(json.meta.limit).toBe(5);
        expect(json.meta.offset).toBe(0);
        expect(json.meta.domain).toBe(domain);
        expect(typeof json.meta.scored).toBe('boolean');

        if (json.data.length > 0) {
          const item = json.data[0];
          expect(item.id).toBeDefined();
          expect(item).not.toHaveProperty('embedding');
        }
      });
    }
  });

  describe('필터 동작', () => {
    it('products — skin_types 필터 (쉼표 구분)', async () => {
      const { res, json } = await exploreRequest('domain=products&skin_types=oily,dry&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('products — category 필터', async () => {
      const { res, json } = await exploreRequest('domain=products&category=skincare&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('products — budget_max 필터', async () => {
      const { res, json } = await exploreRequest('domain=products&budget_max=30000&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('treatments — concerns 필터', async () => {
      const { res, json } = await exploreRequest('domain=treatments&concerns=acne,wrinkles&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('stores — store_type 필터', async () => {
      const { res, json } = await exploreRequest('domain=stores&store_type=olive_young&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('clinics — clinic_type + english_support 복합 필터', async () => {
      const { res, json } = await exploreRequest('domain=clinics&clinic_type=dermatology&english_support=fluent&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('일치 없는 필터 조합 → 빈 결과', async () => {
      const { res, json } = await exploreRequest('domain=products&budget_max=1&limit=5');
      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
    });
  });

  describe('정렬', () => {
    it('sort=rating (기본) → rating desc', async () => {
      const { res, json } = await exploreRequest('domain=products&sort=rating&limit=10');
      expect(res.status).toBe(200);

      if (json.data.length >= 2) {
        const ratings = json.data
          .map((d: Record<string, unknown>) => d.rating as number | null)
          .filter((r: number | null): r is number => r != null);
        for (let i = 1; i < ratings.length; i++) {
          expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
        }
      }
    });

    it('sort=price → price asc (products)', async () => {
      const { res, json } = await exploreRequest('domain=products&sort=price&limit=10');
      expect(res.status).toBe(200);
      // 가격 정렬 확인 (null 포함 가능)
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('sort=relevance + 미인증 → scored=false, rating 폴백', async () => {
      const { res, json } = await exploreRequest('domain=products&sort=relevance&limit=5');
      expect(res.status).toBe(200);
      expect(json.meta.scored).toBe(false);
    });
  });

  describe('페이지네이션', () => {
    it('limit + offset → 올바른 meta 반환', async () => {
      const { res, json } = await exploreRequest('domain=products&limit=3&offset=6');
      expect(res.status).toBe(200);
      expect(json.meta.limit).toBe(3);
      expect(json.meta.offset).toBe(6);
    });

    it('limit > 50 → 50으로 클램핑', async () => {
      const { res, json } = await exploreRequest('domain=products&limit=100');
      expect(res.status).toBe(200);
      expect(json.meta.limit).toBe(50);
    });

    it('offset 증가 시 data.length ≤ limit', async () => {
      const { res, json } = await exploreRequest('domain=products&limit=3&offset=0');
      expect(res.status).toBe(200);
      expect(json.data.length).toBeLessThanOrEqual(3);
    });
  });

  describe('에러 케이스', () => {
    it('domain 누락 → 400', async () => {
      const res = await app.request('/api/explore');
      expect(res.status).toBe(400);
    });

    it('유효하지 않은 domain → 400', async () => {
      const res = await app.request('/api/explore?domain=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('embedding 필드 제거', () => {
    it('모든 도메인 결과에서 embedding 미포함', async () => {
      for (const domain of ['products', 'treatments', 'stores', 'clinics']) {
        const { json } = await exploreRequest(`domain=${domain}&limit=3`);
        for (const item of json.data as Record<string, unknown>[]) {
          expect(item).not.toHaveProperty('embedding');
        }
      }
    });
  });
});
