-- ============================================================
-- pgvector RPC 함수 — 벡터 유사도 검색용
-- PostgREST에서 supabase.rpc() 호출로 사용
-- ============================================================

-- 제품 벡터 검색
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  category text,
  skin_types text[],
  concerns text[],
  price int,
  rating float,
  is_highlighted boolean,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.category, p.skin_types, p.concerns,
    p.price, p.rating, p.is_highlighted,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
    AND p.status = 'active'
    AND (filter_skin_types IS NULL OR p.skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR p.concerns && filter_concerns)
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 시술 벡터 검색
CREATE OR REPLACE FUNCTION match_treatments(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  category text,
  suitable_skin_types text[],
  target_concerns text[],
  price_range jsonb,
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
    t.price_range, t.duration_minutes, t.downtime_days,
    t.rating, t.is_highlighted,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM treatments t
  WHERE t.embedding IS NOT NULL
    AND t.status = 'active'
    AND (filter_skin_types IS NULL OR t.suitable_skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR t.target_concerns && filter_concerns)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
