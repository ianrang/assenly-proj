-- ============================================================
-- Migration 014: 온보딩 완료 게이트 + journeys 활성 유니크 제약 (NEW-9b)
--
-- 1) user_profiles.onboarding_completed_at 컬럼 추가
--    - NULL = 미완료(신규/미제출)
--    - NOT NULL = 완료(Start chatting 또는 Skip 중 하나 수행)
--    - `WHERE IS NULL` 조건부 UPDATE로 원샷 의미론 강제 (불변량 I4)
--    - 재표시 판정의 단일 진실 공급원 (invariant I1/I2)
--
-- 2) journeys 부분 유니크 인덱스 ux_journeys_user_active
--    - MVP 원칙 "단일 active journey per user" (schema.dbml §journeys 주석)를
--      DB 레벨에서 강제
--    - 동시성 경합(S8) 시 23505 unique_violation → 애플리케이션에서 재시도
--    - 선행 단계: 기존 중복 active journey를 archived 처리하여 인덱스 생성 안전화
--    - v0.2 multi-journey 전환 시 DROP INDEX 1줄로 해제
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- Step 1. 기존 중복 active journey dedup (방어적)
--   - 동일 user에 여러 active journey가 있으면 가장 최근(created_at DESC) 1건만 유지
--   - 나머지는 'archived'로 변경 (데이터 보존)
--   - 중복이 없으면 no-op
-- ──────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM journeys
  WHERE status = 'active'
)
UPDATE journeys
   SET status = 'archived'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ──────────────────────────────────────────────────────────
-- Step 2. user_profiles 컬럼 추가
-- ──────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL;

COMMENT ON COLUMN user_profiles.onboarding_completed_at IS
  'NEW-9b: 채팅 내 인라인 온보딩 게이트 완료 시점. NULL=미완료, NOT NULL=Start 또는 Skip 수행. `WHERE IS NULL` 조건부 UPDATE로 원샷 의미론 강제. 재표시 판정의 단일 진실 공급원.';

-- ──────────────────────────────────────────────────────────
-- Step 3. journeys 활성 여정 부분 유니크 인덱스
-- ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_journeys_user_active
  ON journeys(user_id)
  WHERE status = 'active';

COMMENT ON INDEX ux_journeys_user_active IS
  'NEW-9b: MVP 원칙 "단일 active journey per user"를 DB 레벨에서 강제. 동시성 경합 방어. v0.2 multi-journey 전환 시 DROP.';
