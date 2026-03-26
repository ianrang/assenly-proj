-- ============================================================
-- Migration 007: match_treatments RPC 수정
-- 004_schema_v2.sql의 price_range → price_min/max 변경 반영
-- + filter_max_price, filter_max_downtime 파라미터 추가
-- ============================================================

CREATE OR REPLACE FUNCTION match_treatments(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL,
  filter_max_downtime int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  category text,
  suitable_skin_types text[],
  target_concerns text[],
  price_min int,
  price_max int,
  price_currency text,
  duration_minutes int,
  downtime_days int,
  rating float,
  is_highlighted boolean,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.category, t.suitable_skin_types, t.target_concerns,
    t.price_min, t.price_max, t.price_currency,
    t.duration_minutes, t.downtime_days,
    t.rating, t.is_highlighted,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM treatments t
  WHERE t.embedding IS NOT NULL
    AND t.status = 'active'
    AND (filter_skin_types IS NULL OR t.suitable_skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR t.target_concerns && filter_concerns)
    AND (filter_max_price IS NULL OR t.price_max <= filter_max_price)
    AND (filter_max_downtime IS NULL OR t.downtime_days <= filter_max_downtime)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
