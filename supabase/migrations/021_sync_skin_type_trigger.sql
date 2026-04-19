-- ============================================================
-- NEW-17f: 배포 윈도우 안전 — skin_type → skin_types 동기화 trigger.
-- 설계 정본: docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md §2.4.1 (DO-7)
--
-- 목적: migration 015 적용 ~ 코드 배포 완료 사이 윈도우에서
-- 구 코드가 skin_type(단일)에만 write해도 skin_types(배열)에 자동 반영.
-- migration 016(구 컬럼 DROP) 실행 시 이 trigger + 함수도 함께 제거.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_skin_type_to_array() RETURNS trigger AS $$
BEGIN
  IF NEW.skin_type IS NOT NULL
     AND (NEW.skin_types IS NULL OR NOT (NEW.skin_types @> ARRAY[NEW.skin_type])) THEN
    NEW.skin_types := COALESCE(NEW.skin_types, ARRAY[]::text[]) || ARRAY[NEW.skin_type];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_skin_type
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION sync_skin_type_to_array();

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_sync_skin_type ON user_profiles;
-- DROP FUNCTION IF EXISTS sync_skin_type_to_array();
