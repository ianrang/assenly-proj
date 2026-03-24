-- ============================================================
-- Migration 005: 인덱스 전략 적용 (P1-18)
-- 쿼리 패턴 분석 기반 누락 인덱스 추가
-- ============================================================

-- ============================================================
-- 5.1 사용자 데이터 — 누락 인덱스
-- ============================================================

-- beauty_history: RLS auth.uid() = user_id
CREATE INDEX IF NOT EXISTS idx_beauty_history_user_id
  ON beauty_history(user_id);

-- kit_subscribers: 테이블이 001에 미포함 (schema.dbml에만 존재).
-- kit_subscribers CREATE TABLE 마이그레이션 시 인덱스도 함께 추가할 것.

-- ============================================================
-- 5.2 도메인 데이터 — 쇼핑 (DOM-1)
-- ============================================================

-- products: 관리자 필터 brand_id + FK JOIN
CREATE INDEX IF NOT EXISTS idx_products_brand_id
  ON products(brand_id);

-- products: AI 검색 budget_max 필터 (price <= ?)
CREATE INDEX IF NOT EXISTS idx_products_price
  ON products(price);

-- stores: AI 검색 + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_stores_store_type
  ON stores(store_type);

CREATE INDEX IF NOT EXISTS idx_stores_english_support
  ON stores(english_support);

-- ============================================================
-- 5.3 도메인 데이터 — 시술 (DOM-2)
-- ============================================================

-- treatments: WHERE status = 'active' (모든 검색 경로)
CREATE INDEX IF NOT EXISTS idx_treatments_status
  ON treatments(status);

-- treatments: AI 검색 budget_max 필터 (price_max <= ?)
CREATE INDEX IF NOT EXISTS idx_treatments_price_max
  ON treatments(price_max);

-- treatments: AI 검색 max_downtime 필터 (downtime_days <= ?)
CREATE INDEX IF NOT EXISTS idx_treatments_downtime_days
  ON treatments(downtime_days);

-- clinics: AI 검색 + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_type
  ON clinics(clinic_type);

CREATE INDEX IF NOT EXISTS idx_clinics_english_support
  ON clinics(english_support);

-- doctors: FK JOIN + 관리자 필터
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id
  ON doctors(clinic_id);

-- ============================================================
-- 5.4 관계 테이블 — 역방향 조회 인덱스
-- ============================================================

-- product_stores: 매장별 제품 조회 (PK 선두 = product_id)
CREATE INDEX IF NOT EXISTS idx_product_stores_store_id
  ON product_stores(store_id);

-- product_ingredients: 성분별 제품 조회 (PK 선두 = product_id)
CREATE INDEX IF NOT EXISTS idx_product_ingredients_ingredient_id
  ON product_ingredients(ingredient_id);

-- clinic_treatments: 시술별 클리닉 조회 (PK 선두 = clinic_id)
CREATE INDEX IF NOT EXISTS idx_clinic_treatments_treatment_id
  ON clinic_treatments(treatment_id);
