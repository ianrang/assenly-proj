-- ============================================================
-- NEW-17: 배포 시퀀스 4단계 — 구 skin_type 컬럼 DROP.
-- ⚠️ 이 migration은 코드 배포 완료 + 24~72h 관측 후 수동 실행.
-- 적용 방법: Supabase Dashboard SQL Editor
-- 적용 전 체크:
--   (1) 015/015b 적용 완료
--   (2) feat/new-17-profile-merge 코드 production 배포 완료
--   (3) 배포 후 최소 24시간 관측 (에러 로그 0건 확인)
--   (4) 다음 쿼리 실행 결과 0건 확인 (DO-7 운영 런북):
--       SELECT user_id FROM user_profiles
--        WHERE skin_type IS NOT NULL
--          AND (skin_types IS NULL OR NOT (skin_types @> ARRAY[skin_type]));
-- 이 DROP 이후 롤백은 DB backup 의존.
-- ============================================================

-- Step 1: 동기화 trigger + 함수 제거 (021_sync_skin_type_trigger.sql에서 생성)
DROP TRIGGER IF EXISTS trg_sync_skin_type ON user_profiles;
DROP FUNCTION IF EXISTS sync_skin_type_to_array();

-- Step 2: 구 컬럼 DROP
ALTER TABLE user_profiles DROP COLUMN IF EXISTS skin_type;
