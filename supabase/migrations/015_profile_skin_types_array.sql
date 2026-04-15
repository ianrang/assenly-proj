-- ============================================================
-- NEW-17: user_profiles.skin_type 단일 → skin_types TEXT[] (max 3)
--         + AI patch RPC (사용자값 보존 원자 merge)
-- Spec: docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md v1.1
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행
-- ============================================================

-- Step 1. 컬럼 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS skin_types text[] NULL;

COMMENT ON COLUMN user_profiles.skin_types IS
  'NEW-17: UP-1 다중값. 사용자 명시값 + AI 추출 합집합, max 3. products.skin_types 대칭.';

-- Step 2. 무손실 백필
UPDATE user_profiles
   SET skin_types = ARRAY[skin_type]
 WHERE skin_type IS NOT NULL AND skin_types IS NULL;

-- Step 3. CHECK — M2 DB 레벨 (3 = PROFILE_FIELD_SPEC.skin_types.max)
-- 멱등 가드: 수동 배포 환경(Dashboard SQL Editor)에서 재실행 안전성 확보.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_skin_types_max_3'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_skin_types_max_3
      CHECK (skin_types IS NULL OR array_length(skin_types, 1) <= 3);
  END IF;
END $$;

-- Step 4. AI patch RPC — M1/M2/M3/M5 DB 레벨 강제
--
-- 정합성 보강 (v1.1):
--   CR-1: array merge는 cur 원소를 inc보다 먼저 배치하는 priority ordering.
--         cap 도달 시 사용자값 절단 불가(M1).
--   CR-2: 신 값 선계산 후 IS DISTINCT FROM 가드 — FOUND 거짓양성 제거(M5).
CREATE OR REPLACE FUNCTION apply_ai_profile_patch(
  p_user_id uuid,
  p_patch jsonb,
  p_spec jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_field text;
  v_fspec jsonb;
  v_inc jsonb;
  v_applied text[] := ARRAY[]::text[];
  v_cur_scalar text;
  v_cur_arr text[];
  v_new_arr text[];
  v_inc_arr text[];
  v_max int;
BEGIN
  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(p_spec) LOOP
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_fspec->>'cardinality' = 'scalar' THEN
      -- M3 + CR-2: 현 값 조회, NULL일 때만 set.
      -- jsonb_populate_record로 jsonb→컬럼 타입 자동 캐스트 (int/text 등 모두 안전).
      EXECUTE format(
        'SELECT %I::text FROM user_profiles WHERE user_id = $1',
        v_field
      ) INTO v_cur_scalar USING p_user_id;

      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE user_profiles
              SET %I = (jsonb_populate_record(NULL::user_profiles, jsonb_build_object(%L, $1))).%I,
                  updated_at = now()
            WHERE user_id = $2 AND %I IS NULL',
          v_field, v_field, v_field, v_field
        ) USING v_inc, p_user_id;
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      -- CR-1: priority ordering (cur=0, inc=1)
      v_max := (v_fspec->>'max')::int;

      EXECUTE format(
        'SELECT COALESCE(%I, ARRAY[]::text[]) FROM user_profiles WHERE user_id = $1',
        v_field
      ) INTO v_cur_arr USING p_user_id;

      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);

      WITH merged AS (
        SELECT unnest(v_cur_arr) AS x, 0 AS pri
        UNION ALL
        SELECT unnest(COALESCE(v_inc_arr, ARRAY[]::text[])) AS x, 1 AS pri
      ),
      dedup AS (
        SELECT x, MIN(pri) AS pri FROM merged GROUP BY x
      )
      SELECT array_agg(x ORDER BY pri, x)
      INTO v_new_arr
      FROM (SELECT x, pri FROM dedup ORDER BY pri, x LIMIT v_max) t;

      v_new_arr := COALESCE(v_new_arr, ARRAY[]::text[]);

      -- CR-2: IS DISTINCT FROM 가드
      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_new_arr THEN
        EXECUTE format(
          'UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2',
          v_field
        ) USING v_new_arr, p_user_id;
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_ai_profile_patch IS
  'NEW-17 v1.1: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. M1/M2/M3/M5 강제.';
