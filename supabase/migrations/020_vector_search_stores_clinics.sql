-- ============================================================
-- Migration 020: match_stores / match_clinics RPC 생성
-- store/clinic 벡터 유사도 검색.
-- match_products/match_treatments (003, 007, 012) 패턴 동일.
-- embedding vector(1024) 컬럼 + 코사인 거리.
-- RETURNS TABLE: 카드 렌더링 필수 필드.
--   embedding/created_at/updated_at/status 제외 (카드 미사용).
-- ============================================================

-- 매장 벡터 검색
CREATE FUNCTION match_stores(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_district text DEFAULT NULL,
  filter_english_support text DEFAULT NULL,
  filter_store_type text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  country text,
  city text,
  district text,
  address jsonb,
  operating_hours jsonb,
  english_support text,
  store_type text,
  tourist_services text[],
  payment_methods text[],
  nearby_landmarks text[],
  external_links jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.description,
    s.country, s.city, s.district,
    s.address, s.operating_hours,
    s.english_support, s.store_type,
    s.tourist_services, s.payment_methods, s.nearby_landmarks,
    s.external_links,
    s.is_highlighted, s.highlight_badge,
    s.rating, s.review_count,
    s.images, s.tags,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM stores s
  WHERE s.embedding IS NOT NULL
    AND s.status = 'active'
    AND (filter_district IS NULL OR s.district = filter_district)
    AND (filter_english_support IS NULL OR s.english_support = filter_english_support)
    AND (filter_store_type IS NULL OR s.store_type = filter_store_type)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 클리닉 벡터 검색
CREATE FUNCTION match_clinics(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_district text DEFAULT NULL,
  filter_english_support text DEFAULT NULL,
  filter_clinic_type text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  country text,
  city text,
  district text,
  address jsonb,
  operating_hours jsonb,
  english_support text,
  clinic_type text,
  license_verified boolean,
  consultation_type text[],
  foreigner_friendly jsonb,
  booking_url text,
  external_links jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.name, c.description,
    c.country, c.city, c.district,
    c.address, c.operating_hours,
    c.english_support, c.clinic_type,
    c.license_verified, c.consultation_type,
    c.foreigner_friendly, c.booking_url, c.external_links,
    c.is_highlighted, c.highlight_badge,
    c.rating, c.review_count,
    c.images, c.tags,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM clinics c
  WHERE c.embedding IS NOT NULL
    AND c.status = 'active'
    AND (filter_district IS NULL OR c.district = filter_district)
    AND (filter_english_support IS NULL OR c.english_support = filter_english_support)
    AND (filter_clinic_type IS NULL OR c.clinic_type = filter_clinic_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
