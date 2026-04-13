-- ============================================================
-- Migration 013: products + treatments 가격 스키마 확장 (NEW-37)
-- 해석 B: price = 현재 대표 판매가, price_min/max = 참조 가격대 (독립 의미).
-- price BETWEEN min AND max CHECK 미적용 (세일/면세 수용).
-- price_source · range_source 분리. currency 화이트리스트 적용.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- products: 가격 메타데이터 + 참조 가격대 추가
-- ──────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN price_min int NULL,
  ADD COLUMN price_max int NULL,
  ADD COLUMN price_currency text NOT NULL DEFAULT 'KRW',
  ADD COLUMN price_source text NULL,
  ADD COLUMN range_source text NULL,
  ADD COLUMN price_updated_at timestamptz NULL,
  ADD COLUMN price_source_url text NULL;

ALTER TABLE products
  ADD CONSTRAINT products_price_currency_check
    CHECK (price_currency IN ('KRW','USD','JPY','CNY','EUR')),
  ADD CONSTRAINT products_price_source_check
    CHECK (price_source IS NULL OR price_source IN (
      'manual','real','estimated-pipeline','estimated-ai','category-default'
    )),
  ADD CONSTRAINT products_range_source_check
    CHECK (range_source IS NULL OR range_source IN (
      'manual','real','estimated-pipeline','estimated-ai','category-default'
    )),
  ADD CONSTRAINT products_price_range_order_check
    CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max);

-- ──────────────────────────────────────────────────────────
-- treatments: 대표 판매가(price) + 메타데이터 추가
-- (price_min/max/price_currency는 기존 유지)
-- ──────────────────────────────────────────────────────────
ALTER TABLE treatments
  ADD COLUMN price int NULL,
  ADD COLUMN price_source text NULL,
  ADD COLUMN range_source text NULL,
  ADD COLUMN price_updated_at timestamptz NULL,
  ADD COLUMN price_source_url text NULL;

ALTER TABLE treatments
  ADD CONSTRAINT treatments_price_currency_check
    CHECK (price_currency IN ('KRW','USD','JPY','CNY','EUR')),
  ADD CONSTRAINT treatments_price_source_check
    CHECK (price_source IS NULL OR price_source IN (
      'manual','real','estimated-pipeline','estimated-ai','category-default'
    )),
  ADD CONSTRAINT treatments_range_source_check
    CHECK (range_source IS NULL OR range_source IN (
      'manual','real','estimated-pipeline','estimated-ai','category-default'
    ));

-- ──────────────────────────────────────────────────────────
-- Indexes: 가격 필터/정렬용 partial index
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_price
  ON products(price) WHERE price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_price_min
  ON products(price_min) WHERE price_min IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatments_price
  ON treatments(price) WHERE price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatments_price_min
  ON treatments(price_min) WHERE price_min IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- Backfill: 기존 데이터는 'real' 소스로 간주
-- ──────────────────────────────────────────────────────────
UPDATE products
   SET price_source = 'real'
 WHERE price IS NOT NULL AND price_source IS NULL;

UPDATE treatments
   SET range_source = 'real'
 WHERE price_min IS NOT NULL AND range_source IS NULL;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
