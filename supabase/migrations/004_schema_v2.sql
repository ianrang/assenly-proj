-- ============================================================
-- Migration 004: schema.dbml v2.0 적용
-- P1-16 (기존 테이블 수정) + P1-17 (관리자 테이블 생성)
-- ============================================================

-- ============================================================
-- P1-16: 기존 테이블 수정
-- ============================================================

-- 1. stores.brands_available 삭제 (파생 쿼리로 대체)
ALTER TABLE stores DROP COLUMN IF EXISTS brands_available;

-- 2. treatments.price_range JSONB → price_min/max/currency 분리
ALTER TABLE treatments DROP COLUMN IF EXISTS price_range;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS price_min INT;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS price_max INT;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'KRW';

-- 3. brands에 status + updated_at 추가
ALTER TABLE brands ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. ingredients에 status + updated_at 추가
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. doctors에 status + updated_at 추가
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 6. CHECK 제약 추가

-- brands status CHECK
DO $$ BEGIN
  ALTER TABLE brands ADD CONSTRAINT brands_status_check
    CHECK (status IN ('active', 'inactive', 'temporarily_closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ingredients status CHECK
DO $$ BEGIN
  ALTER TABLE ingredients ADD CONSTRAINT ingredients_status_check
    CHECK (status IN ('active', 'inactive', 'temporarily_closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- doctors status CHECK
DO $$ BEGIN
  ALTER TABLE doctors ADD CONSTRAINT doctors_status_check
    CHECK (status IN ('active', 'inactive', 'temporarily_closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- beauty_history.entity_type CHECK
DO $$ BEGIN
  ALTER TABLE beauty_history ADD CONSTRAINT beauty_history_entity_type_check
    CHECK (entity_type IN ('product', 'store', 'clinic', 'treatment'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- behavior_logs.target_type CHECK
DO $$ BEGIN
  ALTER TABLE behavior_logs ADD CONSTRAINT behavior_logs_target_type_check
    CHECK (target_type IN ('product', 'store', 'clinic', 'treatment', 'card', 'link'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. FK ON DELETE 정책 변경
-- 기존 인라인 REFERENCES의 자동 이름: {table}_{column}_fkey

-- user_profiles → users: CASCADE
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_fkey;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- journeys → users: CASCADE
ALTER TABLE journeys DROP CONSTRAINT IF EXISTS journeys_user_id_fkey;
ALTER TABLE journeys ADD CONSTRAINT journeys_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- beauty_history → users: CASCADE
ALTER TABLE beauty_history DROP CONSTRAINT IF EXISTS beauty_history_user_id_fkey;
ALTER TABLE beauty_history ADD CONSTRAINT beauty_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- learned_preferences → users: CASCADE
ALTER TABLE learned_preferences DROP CONSTRAINT IF EXISTS learned_preferences_user_id_fkey;
ALTER TABLE learned_preferences ADD CONSTRAINT learned_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- conversations → users: CASCADE
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- conversations → journeys: SET NULL
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_journey_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_journey_id_fkey
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE SET NULL;

-- messages → conversations: CASCADE
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- behavior_logs → users: CASCADE
ALTER TABLE behavior_logs DROP CONSTRAINT IF EXISTS behavior_logs_user_id_fkey;
ALTER TABLE behavior_logs ADD CONSTRAINT behavior_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- consent_records → users: CASCADE
ALTER TABLE consent_records DROP CONSTRAINT IF EXISTS consent_records_user_id_fkey;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- products → brands: SET NULL
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_brand_id_fkey;
ALTER TABLE products ADD CONSTRAINT products_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;

-- doctors → clinics: RESTRICT
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_clinic_id_fkey;
ALTER TABLE doctors ADD CONSTRAINT doctors_clinic_id_fkey
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT;

-- ============================================================
-- P1-17: 관리자 테이블 생성
-- ============================================================

-- admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
  permissions JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- audit_logs (불변 — updated_at 없음)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- audit_logs 기본 인덱스 (조회 필터용)
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

-- ============================================================
-- RLS: admin 테이블
-- ============================================================

-- admin_users: RLS ON (defense-in-depth, service_role이 우회)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 사용자 앱(anon/authenticated)에서 접근 차단
-- service_role은 RLS를 자동 우회하므로 admin API에서만 접근 가능
CREATE POLICY "admin_users: no public access" ON admin_users
  FOR ALL USING (false);

-- audit_logs: RLS ON + 불변 (INSERT만 service_role에서)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: no public access" ON audit_logs
  FOR ALL USING (false);

-- ============================================================
-- GRANT
-- ============================================================

-- admin 테이블은 service_role만 접근 (anon/authenticated 차단)
GRANT ALL ON admin_users TO service_role;
GRANT ALL ON audit_logs TO service_role;

-- 기존 테이블 GRANT 보완 (새로 추가된 컬럼 포함)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- PostgREST 스키마 캐시 갱신
-- ============================================================
NOTIFY pgrst, 'reload schema';
