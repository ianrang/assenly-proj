import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerProductRoutes } from '@/server/features/api/routes/products';
import { registerTreatmentRoutes } from '@/server/features/api/routes/treatments';
import { registerStoreRoutes } from '@/server/features/api/routes/stores';
import { registerClinicRoutes } from '@/server/features/api/routes/clinics';

describe('Domain read routes (integration)', () => {
  const app = createApp();

  beforeAll(() => {
    registerProductRoutes(app);
    registerTreatmentRoutes(app);
    registerStoreRoutes(app);
    registerClinicRoutes(app);
  });

  async function verifyListEndpoint(path: string) {
    const res = await app.request(`${path}?limit=5&offset=0`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(typeof json.meta.total).toBe('number');
    expect(json.meta.limit).toBe(5);
    expect(json.meta.offset).toBe(0);

    if (json.data.length > 0) {
      const item = json.data[0];
      expect(item.id).toBeDefined();
      expect(item).not.toHaveProperty('embedding');
    }

    return json;
  }

  async function verifyDetailEndpoint(listPath: string, detailPath: string) {
    const listRes = await app.request(`${listPath}?limit=1`);
    const listJson = await listRes.json();

    if (listJson.data.length > 0) {
      const id = listJson.data[0].id;
      const res = await app.request(`${detailPath}/${id}`);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.id).toBe(id);
      expect(json.data).not.toHaveProperty('embedding');
    }

    const res404 = await app.request(`${detailPath}/00000000-0000-4000-8000-000000000000`);
    expect(res404.status).toBe(404);
  }

  describe('GET /api/products', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/products');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/products', '/api/products');
    });

    it('잘못된 UUID → 400', async () => {
      const res = await app.request('/api/products/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/treatments', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/treatments');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/treatments', '/api/treatments');
    });
  });

  describe('GET /api/stores', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/stores');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/stores', '/api/stores');
    });
  });

  describe('GET /api/clinics', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/clinics');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/clinics', '/api/clinics');
    });
  });

  describe('Pagination', () => {
    it('limit > MAX(50) → limit=50으로 클램핑', async () => {
      const res = await app.request('/api/products?limit=100');
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.meta.limit).toBeLessThanOrEqual(50);
    });

    it('offset 지정 → meta.offset 일치', async () => {
      const res = await app.request('/api/products?offset=10');
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.meta.offset).toBe(10);
    });
  });
});
