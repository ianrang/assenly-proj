-- ============================================================
-- NEW-17d: migration 019 rollback
-- Spec: docs/superpowers/specs/2026-04-17-new17d-profile-edit-design.md §16 v1.1
-- 적용 조건: Vercel 이전 배포로 코드 revert 한 이후 Dashboard 수동 실행
-- 목표: post-017 상태 복원 (cooldown 컬럼 없음, AI patch 에 cooldown check 없음,
--       user_explicit RPC 없음)
-- 주의: NEW-17h (search_path 추가) 가 아직 적용되지 않았으므로 rollback 은
--       017 exact state (SET search_path 없음) 를 복원한다 (§16 v1.1 EC-6).
-- ============================================================

BEGIN;

-- Step 1. NEW-17d 신규 RPC DROP
DROP FUNCTION IF EXISTS apply_user_explicit_edit(uuid, jsonb, jsonb);

-- Step 2. 019 Step 7 의 authenticated GRANT 되돌리기 (017 상태로)
REVOKE EXECUTE ON FUNCTION get_profile_field_spec() FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_journey_field_spec() FROM authenticated;

-- Step 3. apply_ai_profile_patch 를 017 원본으로 복원
-- (cooldown check 제거, SET search_path 제거 — 017 exact body)
DROP FUNCTION IF EXISTS apply_ai_profile_patch(uuid, jsonb);

CREATE OR REPLACE FUNCTION apply_ai_profile_patch(
  p_user_id uuid,
  p_patch jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_spec jsonb := get_profile_field_spec();
  v_field text;
  v_fspec jsonb;
  v_inc jsonb;
  v_applied text[] := ARRAY[]::text[];
  v_cur_scalar text;
  v_cur_arr text[];
  v_new_arr text[];
  v_inc_arr text[];
  v_max int;
  v_count int;
BEGIN
  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(v_spec) LOOP
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_fspec->>'cardinality' = 'scalar' THEN
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
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      v_max := (v_fspec->>'max')::int;

      EXECUTE format(
        'SELECT COALESCE(%I, ARRAY[]::text[]) FROM user_profiles WHERE user_id = $1',
        v_field
      ) INTO v_cur_arr USING p_user_id;

      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);

      WITH merged AS (
        SELECT x, 0 AS pri, ord
          FROM unnest(v_cur_arr) WITH ORDINALITY AS t(x, ord)
        UNION ALL
        SELECT x, 1 AS pri, ord
          FROM unnest(COALESCE(v_inc_arr, ARRAY[]::text[])) WITH ORDINALITY AS t(x, ord)
      ),
      first_seen AS (
        SELECT DISTINCT ON (x) x, pri, ord
          FROM merged
          ORDER BY x, pri, ord
      )
      SELECT array_agg(x ORDER BY pri, ord)
      INTO v_new_arr
      FROM (SELECT x, pri, ord FROM first_seen ORDER BY pri, ord LIMIT v_max) t;

      v_new_arr := COALESCE(v_new_arr, ARRAY[]::text[]);

      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_new_arr THEN
        EXECUTE format(
          'UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2',
          v_field
        ) USING v_new_arr, p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb) TO service_role;
COMMENT ON FUNCTION apply_ai_profile_patch(uuid, jsonb) IS
  'NEW-17b v1.2: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. spec은 get_profile_field_spec()으로 서버 고정. service_role 전용.';

-- Step 4. apply_ai_journey_patch 를 017 원본으로 복원
-- (cooldown check 제거, SET search_path 제거, _ensure_active_journey 미사용 — 017 exact body)
DROP FUNCTION IF EXISTS apply_ai_journey_patch(uuid, jsonb);

CREATE OR REPLACE FUNCTION apply_ai_journey_patch(
  p_user_id uuid,
  p_patch jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_spec jsonb := get_journey_field_spec();
  v_journey_id uuid;
  v_field text;
  v_fspec jsonb;
  v_inc jsonb;
  v_applied text[] := ARRAY[]::text[];
  v_cur_scalar text;
  v_cur_arr text[];
  v_new_arr text[];
  v_inc_arr text[];
  v_max int;
  v_count int;
BEGIN
  SELECT id INTO v_journey_id FROM journeys
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO journeys (user_id, status)
    VALUES (p_user_id, 'active')
    ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
    RETURNING id INTO v_journey_id;

    IF v_journey_id IS NULL THEN
      SELECT id INTO v_journey_id FROM journeys
       WHERE user_id = p_user_id AND status = 'active'
       LIMIT 1;
    END IF;
  END IF;

  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(v_spec) LOOP
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_fspec->>'cardinality' = 'scalar' THEN
      EXECUTE format(
        'SELECT %I::text FROM journeys WHERE id = $1',
        v_field
      ) INTO v_cur_scalar USING v_journey_id;

      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE journeys
              SET %I = (jsonb_populate_record(NULL::journeys, jsonb_build_object(%L, $1))).%I
            WHERE id = $2 AND %I IS NULL',
          v_field, v_field, v_field, v_field
        ) USING v_inc, v_journey_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      v_max := (v_fspec->>'max')::int;

      EXECUTE format(
        'SELECT COALESCE(%I, ARRAY[]::text[]) FROM journeys WHERE id = $1',
        v_field
      ) INTO v_cur_arr USING v_journey_id;

      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);

      WITH merged AS (
        SELECT x, 0 AS pri, ord
          FROM unnest(v_cur_arr) WITH ORDINALITY AS t(x, ord)
        UNION ALL
        SELECT x, 1 AS pri, ord
          FROM unnest(COALESCE(v_inc_arr, ARRAY[]::text[])) WITH ORDINALITY AS t(x, ord)
      ),
      first_seen AS (
        SELECT DISTINCT ON (x) x, pri, ord
          FROM merged
          ORDER BY x, pri, ord
      )
      SELECT array_agg(x ORDER BY pri, ord)
      INTO v_new_arr
      FROM (SELECT x, pri, ord FROM first_seen ORDER BY pri, ord LIMIT v_max) t;

      v_new_arr := COALESCE(v_new_arr, ARRAY[]::text[]);

      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_new_arr THEN
        EXECUTE format(
          'UPDATE journeys SET %I = $1 WHERE id = $2',
          v_field
        ) USING v_new_arr, v_journey_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_journey_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_journey_patch(uuid, jsonb) TO service_role;
COMMENT ON FUNCTION apply_ai_journey_patch(uuid, jsonb) IS
  'NEW-17b v1.2: journey AI 추출. spec은 get_journey_field_spec()으로 서버 고정. service_role 전용.';

-- Step 5. 신규 helper / cooldown 함수 drop
DROP FUNCTION IF EXISTS _ensure_active_journey(uuid);
DROP FUNCTION IF EXISTS get_user_edit_cooldown_days();
DROP FUNCTION IF EXISTS get_user_edit_cooldown();

-- Step 6. timestamp 컬럼 drop (CASCADE 불필요 — 참조 없음)
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS skin_types_user_updated_at,
  DROP COLUMN IF EXISTS age_range_user_updated_at;

ALTER TABLE journeys
  DROP COLUMN IF EXISTS skin_concerns_user_updated_at,
  DROP COLUMN IF EXISTS budget_level_user_updated_at;

COMMIT;
