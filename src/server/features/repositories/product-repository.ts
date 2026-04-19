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
// Product 리포지토리 — search-engine.md §2.1, §2.3 Products
// R-8: core/db(client 파라미터) + shared/ + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직(점수, 정렬 알고리즘) 없음.
// G-9: export 4개 (findByFilters, matchByVector, findById, findAll).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Products */
interface ProductFilters {
  skin_types?: string[];
  concerns?: string[];
  category?: string[];
  budget_max?: number;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminProductFilters extends ProductFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'price',
  'review_count',
];

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findProductsByFilters(
  client: SupabaseClient,
  filters: ProductFilters,
  limit: number = 5,
) {
  let query = client.from('products').select('*').eq('status', 'active');

  query = applyArrayOverlap(query, 'skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'concerns', filters.concerns);
  query = applyIn(query, 'category', filters.category);
  query = applyMax(query, 'price', filters.budget_max);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Product search failed');
  }

  return data ?? [];
}

/**
 * AI tool용 벡터 검색.
 * search-engine.md §2.1 matchByVector: pgvector RPC (003_vector_search_functions.sql).
 */
export async function matchProductsByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: ProductFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_products', {
    query_embedding: embedding,
    match_count: limit,
    filter_skin_types: filters.skin_types ?? null,
    filter_concerns: filters.concerns ?? null,
    filter_max_price: filters.budget_max ?? null,
  });

  if (error) {
    throw new Error('Product vector search failed');
  }

  return data ?? [];
}

/**
 * 카드 상세 — 단일 엔티티 + brand JOIN.
 * search-engine.md §2.1 findById.
 */
export async function findProductById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('products')
    .select('*, brand:brands(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Product retrieval failed');
  }

  return data;
}

/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllProducts(
  client: SupabaseClient,
  filters: AdminProductFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('products')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyArrayOverlap(query, 'skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'concerns', filters.concerns);
  query = applyIn(query, 'category', filters.category);
  query = applyMax(query, 'price', filters.budget_max);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Product list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
