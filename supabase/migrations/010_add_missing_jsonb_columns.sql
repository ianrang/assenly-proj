-- schema.dbml 정본에 정의되었으나 마이그레이션에서 누락된 JSONB 컬럼 추가
-- stores.external_links: ExternalLink[] — 지도/웹사이트 등 외부 링크
-- products.purchase_links: PurchaseLink[] — 온라인 구매 링크
-- Rollback:
--   ALTER TABLE stores DROP COLUMN IF EXISTS external_links;
--   ALTER TABLE products DROP COLUMN IF EXISTS purchase_links;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS external_links JSONB;
COMMENT ON COLUMN stores.external_links IS 'ExternalLink[]: {type, url, label?}. Map/website links.';

ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_links JSONB;
COMMENT ON COLUMN products.purchase_links IS 'PurchaseLink[]: {platform, url, affiliate_code?}. Display only.';
