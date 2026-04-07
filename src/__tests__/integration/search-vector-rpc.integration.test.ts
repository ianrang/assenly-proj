import { describe, it, expect, beforeAll } from 'vitest';
import { createVerifyClient } from './helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Vector search RPC 통합 테스트 (P2-72)
//
// production 코드 import 0건 — createVerifyClient (service_role)로
// Supabase RPC를 직접 호출하여 match_products/match_treatments의
// 기계적 정확성을 검증.
//
// 임베딩 획득: DB에서 기존 제품/시술의 embedding을 읽어
// 동일 벡터로 RPC 호출 (자기 매칭).
// ============================================================

/** match_products RPC RETURNS TABLE 필수 컬럼 (012_expand_rpc_columns.sql) */
const PRODUCT_RPC_COLUMNS = [
  'id', 'name', 'description', 'brand_id', 'category', 'subcategory',
  'skin_types', 'hair_types', 'concerns', 'key_ingredients',
  'price', 'volume', 'purchase_links',
  'english_label', 'tourist_popular',
  'is_highlighted', 'highlight_badge',
  'rating', 'review_count', 'review_summary',
  'images', 'tags', 'similarity',
] as const;

/** match_treatments RPC RETURNS TABLE 필수 컬럼 (012_expand_rpc_columns.sql) */
const TREATMENT_RPC_COLUMNS = [
  'id', 'name', 'description', 'category', 'subcategory',
  'target_concerns', 'suitable_skin_types',
  'price_min', 'price_max', 'price_currency',
  'duration_minutes', 'downtime_days', 'session_count',
  'precautions', 'aftercare',
  'is_highlighted', 'highlight_badge',
  'rating', 'review_count',
  'images', 'tags', 'similarity',
] as const;

// 임베딩 존재 확인 — 파이프라인 미실행 시 전체 스킵
async function checkEmbeddingsExist(): Promise<boolean> {
  const client = createVerifyClient();
  const { count } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .not('embedding', 'is', null);
  return (count ?? 0) > 0;
}

const hasEmbeddings = await checkEmbeddingsExist();

describe.skipIf(!hasEmbeddings)('Vector search RPC (integration)', () => {
  let client: SupabaseClient;

  // 자기 매칭용 샘플 데이터
  let productSample: { id: string; embedding: number[]; skin_types: string[]; price: number };
  let treatmentSample: { id: string; embedding: number[]; suitable_skin_types: string[]; downtime_days: number };

  beforeAll(async () => {
    client = createVerifyClient();

    // Products: oily skin_types를 가진 제품 1건 선택 (필터 테스트용)
    const { data: pSample, error: pErr } = await client
      .from('products')
      .select('id, embedding, skin_types, price')
      .eq('status', 'active')
      .not('embedding', 'is', null)
      .contains('skin_types', ['oily'])
      .limit(1)
      .single();
    if (pErr || !pSample) throw new Error(`product sample failed: ${pErr?.message}`);
    productSample = pSample as typeof productSample;

    // Treatments: sensitive skin_types를 가진 시술 1건 선택
    const { data: tSample, error: tErr } = await client
      .from('treatments')
      .select('id, embedding, suitable_skin_types, downtime_days')
      .eq('status', 'active')
      .not('embedding', 'is', null)
      .contains('suitable_skin_types', ['sensitive'])
      .limit(1)
      .single();
    if (tErr || !tSample) throw new Error(`treatment sample failed: ${tErr?.message}`);
    treatmentSample = tSample as typeof treatmentSample;
  });

  // ============================================================
  // match_products
  // ============================================================

  describe('match_products RPC', () => {
    it('V-P01: 자기 매칭 → 해당 제품이 결과에 포함, similarity > 0.99', async () => {
      const { data, error } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      const self = data!.find((r: Record<string, unknown>) => r.id === productSample.id);
      expect(self).toBeDefined();
      expect(self!.similarity as number).toBeGreaterThan(0.99);
    });

    it('V-P02: 반환 컬럼 스키마 — 012 migration 정의와 일치', async () => {
      const { data } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 1,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
      });
      expect(data!.length).toBeGreaterThan(0);

      const item = data![0];
      for (const col of PRODUCT_RPC_COLUMNS) {
        expect(item).toHaveProperty(col);
      }
      // similarity는 0~1 범위 float
      expect(typeof item.similarity).toBe('number');
      expect(item.similarity).toBeGreaterThanOrEqual(0);
      expect(item.similarity).toBeLessThanOrEqual(1);
    });

    it('V-P03: match_count=3 → 결과 ≤ 3', async () => {
      const { data } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 3,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
      });
      expect(data!.length).toBeLessThanOrEqual(3);
    });

    it('V-P04: filter_skin_types=[oily] → 모든 결과에 oily 포함', async () => {
      const { data } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: ['oily'],
        filter_concerns: null,
        filter_max_price: null,
      });
      expect(data!.length).toBeGreaterThan(0);
      for (const item of data!) {
        expect(item.skin_types as string[]).toContain('oily');
      }
    });

    it('V-P05: filter_max_price=50000 → 반환된 모든 결과 price ≤ 50000 + null 제외', async () => {
      // 현재 데이터: 200/201 제품이 price=null → RPC가 null price를 정확히 제외하는지 검증
      // SQL: p.price <= filter_max_price — NULL <= 50000 = NULL (FALSE) → 제외됨
      const { data, error } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: 50000,
      });
      expect(error).toBeNull();
      for (const item of data!) {
        expect(item.price).not.toBeNull();
        expect(item.price as number).toBeLessThanOrEqual(50000);
      }
    });

    it('V-P06: 필터 적용 시 결과 수 ≤ 필터 미적용', async () => {
      const { data: unfiltered } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
      });
      const { data: filtered } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: ['oily'],
        filter_concerns: null,
        filter_max_price: 15000,
      });
      expect(filtered!.length).toBeLessThanOrEqual(unfiltered!.length);
    });

    it('V-P07: filter_concerns=[acne] → 모든 결과에 acne 포함', async () => {
      const { data } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: ['acne'],
        filter_max_price: null,
      });
      expect(data!.length).toBeGreaterThan(0);
      for (const item of data!) {
        expect(item.concerns as string[]).toContain('acne');
      }
    });

    it('V-P08: similarity 정렬 — 결과가 내림차순', async () => {
      const { data } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
      });
      expect(data!.length).toBeGreaterThan(1);
      for (let i = 0; i < data!.length - 1; i++) {
        expect(data![i].similarity as number).toBeGreaterThanOrEqual(data![i + 1].similarity as number);
      }
    });

    it('V-P09: 극단적 필터 → 빈 배열 (에러 아님)', async () => {
      const { data, error } = await client.rpc('match_products', {
        query_embedding: productSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: 1,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBe(0);
    });
  });

  // ============================================================
  // match_treatments
  // ============================================================

  describe('match_treatments RPC', () => {
    it('V-T01: 자기 매칭 → 해당 시술이 결과에 포함, similarity > 0.99', async () => {
      // DB에 match_treatments 구버전(4-param)이 남아있어 PostgREST 오버로드 충돌 방지 위해
      // 모든 파라미터를 명시적으로 전달 (filter_max_price, filter_max_downtime = null)
      const { data, error } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
        filter_max_downtime: null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      const self = data!.find((r: Record<string, unknown>) => r.id === treatmentSample.id);
      expect(self).toBeDefined();
      expect(self!.similarity as number).toBeGreaterThan(0.99);
    });

    it('V-T02: filter_max_downtime=1 → 모든 결과 downtime_days ≤ 1', async () => {
      const { data } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
        filter_max_downtime: 1,
      });
      expect(data!.length).toBeGreaterThan(0);
      for (const item of data!) {
        expect(item.downtime_days as number).toBeLessThanOrEqual(1);
      }
    });

    it('V-T03: filter_skin_types + filter_concerns 복합 → 교차 필터', async () => {
      const { data } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 5,
        filter_skin_types: ['sensitive'],
        filter_concerns: ['pores'],
        filter_max_price: null,
        filter_max_downtime: null,
      });
      for (const item of data!) {
        expect(item.suitable_skin_types as string[]).toContain('sensitive');
        expect(item.target_concerns as string[]).toContain('pores');
      }
    });

    it('V-T04: 반환 컬럼 스키마 — 012 migration 정의와 일치', async () => {
      const { data } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 1,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: null,
        filter_max_downtime: null,
      });
      expect(data!.length).toBeGreaterThan(0);

      const item = data![0];
      for (const col of TREATMENT_RPC_COLUMNS) {
        expect(item).toHaveProperty(col);
      }
      expect(typeof item.similarity).toBe('number');
      expect(item.similarity).toBeGreaterThanOrEqual(0);
      expect(item.similarity).toBeLessThanOrEqual(1);
    });

    it('V-T05: filter_max_price=100000 → 모든 결과 price_max ≤ 100000', async () => {
      const { data } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: 100000,
        filter_max_downtime: null,
      });
      expect(data!.length).toBeGreaterThan(0);
      for (const item of data!) {
        expect(item.price_max as number).toBeLessThanOrEqual(100000);
      }
    });

    it('V-T06: 극단적 필터 → 빈 배열 (에러 아님)', async () => {
      const { data, error } = await client.rpc('match_treatments', {
        query_embedding: treatmentSample.embedding,
        match_count: 5,
        filter_skin_types: null,
        filter_concerns: null,
        filter_max_price: 1,
        filter_max_downtime: null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBe(0);
    });
  });
});
