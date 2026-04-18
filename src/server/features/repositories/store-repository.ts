import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyExact,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from './query-utils';

// ============================================================
// Store 리포지토리 — search-engine.md §2.1, §2.3 Stores
// R-8: core/db(client 파라미터) + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직 없음.
// G-9: export 4개 (findByFilters, matchByVector, findById, findAll).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Stores */
interface StoreFilters {
  district?: string;
  english_support?: string;
  store_type?: string;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminStoreFilters extends StoreFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'district',
];

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findStoresByFilters(
  client: SupabaseClient,
  filters: StoreFilters,
  limit: number = 5,
) {
  let query = client.from('stores').select('*').eq('status', 'active');

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'store_type', filters.store_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Store search failed');
  }

  return data ?? [];
}

/**
 * AI tool용 벡터 검색.
 * search-engine.md §2.1 matchByVector: pgvector RPC (020_vector_search_stores_clinics.sql).
 */
export async function matchStoresByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: StoreFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_stores', {
    query_embedding: embedding,
    match_count: limit,
    filter_district: filters.district ?? null,
    filter_english_support: filters.english_support ?? null,
    filter_store_type: filters.store_type ?? null,
  });

  if (error) {
    throw new Error('Store vector search failed');
  }

  return data ?? [];
}

/**
 * 카드 상세 — 단일 Store.
 * search-engine.md §2.1 findById. JOIN 관계 없음 (§2.1: store JOIN 미정의).
 */
export async function findStoreById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Store retrieval failed');
  }

  return data;
}

/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllStores(
  client: SupabaseClient,
  filters: AdminStoreFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('stores')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'store_type', filters.store_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Store list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
