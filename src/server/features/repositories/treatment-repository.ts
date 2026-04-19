import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyArrayOverlap,
  applyIn,
  applyMax,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from './query-utils';

// ============================================================
// Treatment 리포지토리 — search-engine.md §2.1, §2.3 Treatments
// R-8: core/db(client 파라미터) + shared/ + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직(다운타임 판단, 랭킹) 없음.
// G-9: export 4개 (findByFilters, matchByVector, findById, findAll).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Treatments */
interface TreatmentFilters {
  skin_types?: string[];
  concerns?: string[];
  category?: string[];
  budget_max?: number;
  max_downtime?: number;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminTreatmentFilters extends TreatmentFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'price_min',
  'duration_minutes',
  'downtime_days',
  'review_count',
];

/** clinics JOIN 필드 — embedding(vector 4KB+) 제외, 카드 표시용 */
const CLINIC_CARD_FIELDS = [
  'id', 'name', 'district', 'english_support', 'clinic_type',
  'rating', 'review_count', 'booking_url', 'images',
  'is_highlighted', 'highlight_badge',
].join(', ');

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findTreatmentsByFilters(
  client: SupabaseClient,
  filters: TreatmentFilters,
  limit: number = 5,
) {
  let query = client.from('treatments').select('*').eq('status', 'active');

  query = applyArrayOverlap(query, 'suitable_skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'target_concerns', filters.concerns);
  query = applyIn(query, 'category', filters.category);
  query = applyMax(query, 'price_max', filters.budget_max);
  query = applyMax(query, 'downtime_days', filters.max_downtime);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Treatment search failed');
  }

  return data ?? [];
}

/**
 * AI tool용 벡터 검색.
 * search-engine.md §2.1 matchByVector: pgvector RPC (007_fix_match_treatments.sql).
 */
export async function matchTreatmentsByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: TreatmentFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_treatments', {
    query_embedding: embedding,
    match_count: limit,
    filter_skin_types: filters.skin_types ?? null,
    filter_concerns: filters.concerns ?? null,
    filter_max_price: filters.budget_max ?? null,
    filter_max_downtime: filters.max_downtime ?? null,
  });

  if (error) {
    throw new Error('Treatment vector search failed');
  }

  return data ?? [];
}

/**
 * 카드 상세 — 단일 Treatment + clinics JOIN.
 * search-engine.md §2.1 findById: "treatment → clinics".
 * clinics embedding(vector 1024) 제외 — 카드 표시 불필요, 4KB+/clinic 절감.
 */
export async function findTreatmentById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('treatments')
    .select(`*, clinics:clinic_treatments(clinic:clinics(${CLINIC_CARD_FIELDS}))`)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Treatment retrieval failed');
  }

  return data;
}

/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllTreatments(
  client: SupabaseClient,
  filters: AdminTreatmentFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('treatments')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyArrayOverlap(query, 'suitable_skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'target_concerns', filters.concerns);
  query = applyIn(query, 'category', filters.category);
  query = applyMax(query, 'price_max', filters.budget_max);
  query = applyMax(query, 'downtime_days', filters.max_downtime);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Treatment list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
