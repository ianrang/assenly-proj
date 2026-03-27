import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfileVars, JourneyContextVars, LearnedPreference } from '@/shared/types/profile';
import type { SkinConcern } from '@/shared/types/domain';
import { embedQuery } from '@/server/core/knowledge';
import { findProductsByFilters, matchProductsByVector } from '@/server/features/repositories/product-repository';
import { findTreatmentsByFilters, matchTreatmentsByVector } from '@/server/features/repositories/treatment-repository';
import { scoreProducts } from '@/server/features/beauty/shopping';
import { scoreTreatments } from '@/server/features/beauty/treatment';
import { rank } from '@/server/features/beauty/judgment';
import { calculatePreferredIngredients, calculateAvoidedIngredients } from '@/server/features/beauty/derived';

// ============================================================
// search_beauty_data Tool Handler — tool-spec.md §1
// R-6: repositories/ + beauty/ + core/ 직접 import 허용 (tool handler 유일한 예외).
// R-10: service 역호출 금지.
// search-engine.md §1.1 경로1, §5.2 벡터/SQL 분기.
// ============================================================

/** tool execute에 전달되는 context (P-4: chatService가 구성) */
export interface SearchToolContext {
  client: SupabaseClient;
  profile: UserProfileVars | null;
  journey: JourneyContextVars | null;
  preferences: LearnedPreference[];
}

/** tool-spec.md §1 입력에서 추출한 필터 */
interface SearchArgs {
  query: string;
  domain: 'shopping' | 'treatment';
  filters?: {
    skin_types?: string[];
    concerns?: SkinConcern[];
    category?: string;
    budget_max_krw?: number;
    max_downtime?: number;
    english_support?: string;
  };
  limit?: number;
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
    return await searchTreatment(client, query, filters, limit, journey);
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
    skin_types: filters?.skin_types,
    concerns: filters?.concerns,
    category: filters?.category,
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
  const preferred = calculatePreferredIngredients(
    profile?.skin_type ?? null,
    filters?.concerns ?? [],
    preferences.filter(p => p.direction === 'like'),
  );
  const avoided = calculateAvoidedIngredients(
    profile?.skin_type ?? null,
    preferences.filter(p => p.direction === 'dislike'),
  );
  const scored = scoreProducts(products, preferred, avoided);
  const ranked = rank(scored);

  // 관련 stores 조회 (R-6: tool handler에서 junction 조회 허용)
  // tool-spec.md §4.2: 부분 JOIN 실패 → 핵심 데이터 반환, 관계 필드 빈 배열
  const productIds = ranked.map(r => r.item.id);
  const storeMap = await loadRelatedStores(client, productIds, filters?.english_support)
    .catch(() => new Map<string, unknown[]>());

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
    category: filters?.category,
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
  const treatmentIds = ranked.map(r => r.item.id);
  const clinicMap = await loadRelatedClinics(client, treatmentIds, filters?.english_support)
    .catch(() => new Map<string, unknown[]>());

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
  } catch {
    // tool-spec.md §4.2: 임베딩 실패 → SQL 폴백
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
    .select('product_id, store:stores(id, name, district, english_support, store_type, rating)')
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
