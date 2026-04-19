import 'server-only';

// ============================================================
// 공통 쿼리 유틸 — search-engine.md §2.2
// 모든 repository에서 재사용. SQL 연산자만 래핑.
// L-8: 비즈니스 로직 없음. DB 쿼리 빌더 헬퍼만.
// VP-3: 모든 함수 — value가 null/undefined이면 query 미변경.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase PostgrestFilterBuilder의 정확한 제네릭 체이닝 타입을 표현하기 어려워
// query 파라미터에 한해 any 사용. 반환도 동일 query 객체를 그대로 전달.

/** 배열 겹침 (OR): column && ARRAY[values] */
export function applyArrayOverlap(
  query: any,
  column: string,
  values: string[] | undefined,
): any {
  if (values == null || values.length === 0) return query;
  return query.overlaps(column, values);
}

/** 복수 값 일치 (IN): column IN (values) — 단일 값이면 eq, 복수면 in */
export function applyIn(
  query: any,
  column: string,
  values: string[] | undefined,
): any {
  if (values == null || values.length === 0) return query;
  if (values.length === 1) return query.eq(column, values[0]);
  return query.in(column, values);
}

/** 정확 일치: column = value */
export function applyExact(
  query: any,
  column: string,
  value: string | undefined,
): any {
  if (value == null) return query;
  return query.eq(column, value);
}

/** 범위 이하: column <= value */
export function applyMax(
  query: any,
  column: string,
  value: number | undefined,
): any {
  if (value == null) return query;
  return query.lte(column, value);
}

/** 범위 이상: column >= value */
export function applyMin(
  query: any,
  column: string,
  value: number | undefined,
): any {
  if (value == null) return query;
  return query.gte(column, value);
}

/** 텍스트 검색 (JSONB ILIKE): name->>'ko' ILIKE '%text%' OR name->>'en' ILIKE '%text%' */
export function applyTextSearch(
  query: any,
  column: string,
  text: string | undefined,
): any {
  if (text == null || text.trim() === '') return query;
  const escaped = text.replace(/[%_]/g, '\\$&');
  return query.or(
    `${column}->>ko.ilike.%${escaped}%,${column}->>en.ilike.%${escaped}%`,
  );
}

/** 관리자 API 페이지네이션 */
export function applyPagination(
  query: any,
  page: number,
  pageSize: number,
): any {
  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;
  return query.range(from, to);
}

/** AI tool용 단순 LIMIT */
export function applyLimit(query: any, limit: number): any {
  return query.limit(limit);
}

/** 정렬 — 허용 필드 검증 (SQL injection 방지) */
export function applySort(
  query: any,
  field: string,
  order: 'asc' | 'desc',
  allowedFields: string[],
  defaultField: string = 'created_at',
): any {
  const safeField = allowedFields.includes(field) ? field : defaultField;
  return query.order(safeField, { ascending: order === 'asc' });
}
