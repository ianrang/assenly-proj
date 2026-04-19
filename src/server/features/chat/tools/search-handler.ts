import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfileVars, JourneyContextVars, LearnedPreference } from '@/shared/types/profile';
import { embedQuery } from '@/server/core/knowledge';
import { findProductsByFilters, matchProductsByVector } from '@/server/features/repositories/product-repository';
import { findTreatmentsByFilters, matchTreatmentsByVector } from '@/server/features/repositories/treatment-repository';
import { findStoresByFilters, matchStoresByVector } from '@/server/features/repositories/store-repository';
import { findClinicsByFilters, matchClinicsByVector } from '@/server/features/repositories/clinic-repository';
import { scoreProducts } from '@/server/features/beauty/shopping';
import { scoreTreatments } from '@/server/features/beauty/treatment';
import { scoreStores } from '@/server/features/beauty/store';
import { scoreClinics } from '@/server/features/beauty/clinic';
import { rank } from '@/server/features/beauty/judgment';
import {
  calculatePreferredIngredients,
  calculateAvoidedIngredients,
  resolveConflicts,
} from '@/server/features/beauty/derived';

// ============================================================
// search_beauty_data Tool Handler — tool-spec.md §1
// R-6: repositories/ + beauty/ + core/ 직접 import 허용 (tool handler 유일한 예외).
// R-10: service 역호출 금지.
// search-engine.md §1.1 경로1, §5.2 벡터/SQL 분기.
// ============================================================

/** tool-spec.md §1 입력 스키마 — service.ts에서 tool() inputSchema로 사용 */
export const searchBeautyDataSchema = z.object({
  query: z.string().describe('Search query in natural language'),
  domain: z.enum(['shopping', 'treatment', 'store', 'clinic']).describe('shopping = products+stores, treatment = procedures+clinics, store = store/shop locations, clinic = clinic locations'),
  filters: z.object({
    skin_types: z.array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])).optional(),
    concerns: z.array(z.enum([
      'acne', 'wrinkles', 'dark_spots', 'redness', 'dryness',
      'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema',
    ])).optional(),
    category: z.string().optional(),
    budget_max_krw: z.number().optional(),
    max_downtime: z.number().optional(),
    english_support: z.enum(['none', 'basic', 'good', 'fluent']).optional(),
  }).optional(),
  limit: z.number().optional(),
});

/** 스키마에서 추론된 입력 타입 */
type SearchArgs = z.infer<typeof searchBeautyDataSchema>;

/** tool execute에 전달되는 context (P-4: chatService가 구성) */
export interface SearchToolContext {
  client: SupabaseClient;
  profile: UserProfileVars | null;
  journey: JourneyContextVars | null;
  preferences: LearnedPreference[];
}

const MAX_LIMIT = 5;

/**
 * search_beauty_data tool execute 함수.
 * tool-spec.md §1: domain별 검색 + 판단 + 관련 엔티티 조합.
 * search-engine.md §5.2: 벡터/SQL 분기.
 * tool-spec.md §4.2: 에러 처리 (DB 실패→에러 반환, 임베딩 실패→SQL 폴백).
 */
export async function executeSearchBeautyData(
  args: SearchArgs,
  context: SearchToolContext,
) {
  const { client, profile, journey, preferences } = context;
  const { domain, query, filters, limit: rawLimit } = args;
  const limit = Math.min(rawLimit ?? 3, MAX_LIMIT);

  try {
    if (domain === 'shopping') {
      return await searchShopping(client, query, filters, limit, profile, preferences);
    }
    if (domain === 'treatment') {
      return await searchTreatment(client, query, filters, limit, journey);
    }
    if (domain === 'store') {
      return await searchStore(client, query, filters, limit, profile?.language ?? null);
    }
    return await searchClinic(client, query, filters, limit, profile?.language ?? null);
  } catch {
    // tool-spec.md §4.2: DB 에러 → 에러 결과 반환, LLM이 사과
    return { cards: [], total: 0, error: 'DB_UNAVAILABLE' };
  }
}

// --- domain: shopping ---

async function searchShopping(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  profile: UserProfileVars | null,
  preferences: LearnedPreference[],
) {
  const productFilters = {
    skin_types:
      filters?.skin_types ??
      (profile?.skin_types && profile.skin_types.length > 0
        ? profile.skin_types
        : undefined),
    concerns: filters?.concerns,
    category: filters?.category ? [filters.category] : undefined,
    budget_max: filters?.budget_max_krw,
    search: undefined as string | undefined,
  };

  // §5.2 벡터/SQL 분기
  const products = await searchWithFallback(
    query,
    (embedding) => matchProductsByVector(client, embedding, productFilters, limit),
    () => findProductsByFilters(client, productFilters, limit),
  );

  // beauty 판단: DV-1/2 → scoreProducts → rank (§3.1 3~5단계)
  const preferredRaw = calculatePreferredIngredients(
    profile?.skin_types ?? [],
    filters?.concerns ?? [],
    preferences.filter((p) => p.direction === 'like'),
  );
  const avoidedRaw = calculateAvoidedIngredients(
    profile?.skin_types ?? [],
    preferences.filter((p) => p.direction === 'dislike'),
  );
  // NEW-17 (2A): 복수 skin_types 확장 시 preferred ∩ avoided 충돌 해결
  const { preferred, avoided } = resolveConflicts(preferredRaw, avoidedRaw);
  const scored = scoreProducts(products, preferred, avoided);
  const ranked = rank(scored);

  // 관련 stores 조회 (R-6: tool handler에서 junction 조회 허용)
  // tool-spec.md §4.2: 부분 JOIN 실패 → 핵심 데이터 반환, 관계 필드 빈 배열
  // Q-7: 에러 불삼킴 — 로깅 후 빈 Map 폴백 (chat-quality-improvements.md §5.1)
  const productIds = ranked.map(r => r.item.id);
  const storeMap = await loadRelatedStores(client, productIds, filters?.english_support)
    .catch((error: unknown) => {
      console.error('[STORE_JOIN_FAILED]', {
        productIds,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map<string, unknown[]>();
    });

  const cards = ranked.map(r => {
    const product = products.find(p => p.id === r.item.id);
    return {
      ...product,
      reasons: r.item.reasons,
      stores: storeMap.get(r.item.id) ?? [],
    };
  });

  return { cards, total: cards.length };
}

// --- domain: treatment ---

async function searchTreatment(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  journey: JourneyContextVars | null,
) {
  const treatmentFilters = {
    skin_types: filters?.skin_types,
    concerns: filters?.concerns,
    category: filters?.category ? [filters.category] : undefined,
    budget_max: filters?.budget_max_krw,
    max_downtime: filters?.max_downtime,
  };

  // §5.2 벡터/SQL 분기
  const treatments = await searchWithFallback(
    query,
    (embedding) => matchTreatmentsByVector(client, embedding, treatmentFilters, limit),
    () => findTreatmentsByFilters(client, treatmentFilters, limit),
  );

  // beauty 판단: scoreTreatments → rank (§3.1 3~5단계)
  const scored = scoreTreatments(
    treatments,
    journey?.end_date ?? null,
    journey?.stay_days ?? null,
    new Date(),
  );
  const ranked = rank(scored);

  // 관련 clinics 조회 (R-6)
  // tool-spec.md §4.2: 부분 JOIN 실패 → 핵심 데이터 반환, 관계 필드 빈 배열
  // Q-7: 에러 불삼킴 — 로깅 후 빈 Map 폴백 (chat-quality-improvements.md §5.1)
  const treatmentIds = ranked.map(r => r.item.id);
  const clinicMap = await loadRelatedClinics(client, treatmentIds, filters?.english_support)
    .catch((error: unknown) => {
      console.error('[CLINIC_JOIN_FAILED]', {
        treatmentIds,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map<string, unknown[]>();
    });

  const cards = ranked.map(r => {
    const treatment = treatments.find(t => t.id === r.item.id);
    return {
      ...treatment,
      reasons: r.item.reasons,
      clinics: clinicMap.get(r.item.id) ?? [],
    };
  });

  return { cards, total: cards.length };
}

// --- domain: store ---

async function searchStore(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  userLanguage: string | null,
) {
  const storeFilters = {
    store_type: filters?.category,
    english_support: filters?.english_support,
    search: query || undefined,
  };

  // §5.2 벡터/SQL 분기
  const stores = await searchWithFallback(
    query,
    (embedding) => matchStoresByVector(client, embedding, storeFilters, limit),
    () => findStoresByFilters(client, storeFilters, limit),
  );

  // beauty 판단: scoreStores → rank
  const scored = scoreStores(stores, userLanguage);
  const ranked = rank(scored);

  const cards = ranked.map(r => {
    const store = stores.find(s => s.id === r.item.id);
    return {
      ...store,
      reasons: r.item.reasons,
    };
  });

  return { cards, total: cards.length };
}

// --- domain: clinic ---

async function searchClinic(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  userLanguage: string | null,
) {
  const clinicFilters = {
    clinic_type: filters?.category,
    english_support: filters?.english_support,
    search: query || undefined,
  };

  // §5.2 벡터/SQL 분기
  const clinics = await searchWithFallback(
    query,
    (embedding) => matchClinicsByVector(client, embedding, clinicFilters, limit),
    () => findClinicsByFilters(client, clinicFilters, limit),
  );

  // beauty 판단: scoreClinics → rank
  const scored = scoreClinics(clinics, userLanguage);
  const ranked = rank(scored);

  const cards = ranked.map(r => {
    const clinic = clinics.find(c => c.id === r.item.id);
    return {
      ...clinic,
      reasons: r.item.reasons,
    };
  });

  return { cards, total: cards.length };
}

// --- 공통 유틸 ---

/**
 * 벡터 검색 시도 → 실패 시 SQL 폴백.
 * tool-spec.md §4.2: embedQuery 실패 → SQL 필터 검색으로 폴백.
 */
async function searchWithFallback<T>(
  query: string,
  vectorSearch: (embedding: number[]) => Promise<T[]>,
  sqlSearch: () => Promise<T[]>,
): Promise<T[]> {
  if (!query) return sqlSearch();

  try {
    const embedding = await embedQuery(query);
    return await vectorSearch(embedding);
  } catch (error) {
    // tool-spec.md §4.2: 임베딩 실패 → SQL 폴백
    // Q-7: 에러 불삼킴 — 로깅 후 SQL 폴백 (chat-quality-improvements.md §5.1)
    console.warn('[EMBED_FALLBACK]', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return sqlSearch();
  }
}

/**
 * product_stores junction → 관련 stores 조회.
 * R-6 허용: tool handler에서 직접 DB 조회.
 */
async function loadRelatedStores(
  client: SupabaseClient,
  productIds: string[],
  englishSupport?: string,
): Promise<Map<string, unknown[]>> {
  if (productIds.length === 0) return new Map();

  const { data: junctions } = await client
    .from('product_stores')
    .select('product_id, store:stores(id, name, district, english_support, store_type, rating, external_links)')
    .in('product_id', productIds);

  const map = new Map<string, unknown[]>();
  for (const row of junctions ?? []) {
    const store = (row as { product_id: string; store: unknown }).store;
    const pid = (row as { product_id: string }).product_id;
    if (!store) continue;
    if (englishSupport && (store as { english_support?: string }).english_support !== englishSupport) continue;
    const list = map.get(pid) ?? [];
    list.push(store);
    map.set(pid, list);
  }
  return map;
}

/**
 * clinic_treatments junction → 관련 clinics 조회.
 * R-6 허용: tool handler에서 직접 DB 조회.
 */
async function loadRelatedClinics(
  client: SupabaseClient,
  treatmentIds: string[],
  englishSupport?: string,
): Promise<Map<string, unknown[]>> {
  if (treatmentIds.length === 0) return new Map();

  const { data: junctions } = await client
    .from('clinic_treatments')
    .select('treatment_id, clinic:clinics(id, name, district, english_support, clinic_type, rating, booking_url)')
    .in('treatment_id', treatmentIds);

  const map = new Map<string, unknown[]>();
  for (const row of junctions ?? []) {
    const clinic = (row as { treatment_id: string; clinic: unknown }).clinic;
    const tid = (row as { treatment_id: string }).treatment_id;
    if (!clinic) continue;
    if (englishSupport && (clinic as { english_support?: string }).english_support !== englishSupport) continue;
    const list = map.get(tid) ?? [];
    list.push(clinic);
    map.set(tid, list);
  }
  return map;
}
