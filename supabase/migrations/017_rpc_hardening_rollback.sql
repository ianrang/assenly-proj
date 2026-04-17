-- ============================================================
-- NEW-17b 롤백: 3-arg RPC 복원 + GRANT authenticated 복원 + CHECK 제약 DROP
-- 적용: Supabase Dashboard SQL Editor
-- 주의: 코드 롤백과 동시에 실행. 단독 실행 시 2-arg 호출부가 500 반환.
-- ============================================================

BEGIN;

-- Step R1. CHECK 제약 DROP (신규 제약만)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_skin_types_values;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_age_range_values;
ALTER TABLE journeys DROP CONSTRAINT IF EXISTS journeys_budget_level_values;

-- Step R2. 신 2-arg RPC DROP
DROP FUNCTION IF EXISTS apply_ai_profile_patch(uuid, jsonb);
DROP FUNCTION IF EXISTS apply_ai_journey_patch(uuid, jsonb);
DROP FUNCTION IF EXISTS get_profile_field_spec();
DROP FUNCTION IF EXISTS get_journey_field_spec();

-- Step R3. 구 3-arg apply_ai_profile_patch 재생성 (015 line 40-124 동일)
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
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) TO authenticated;

-- Step R4. 구 3-arg apply_ai_journey_patch 재생성 (015b 동일)
CREATE OR REPLACE FUNCTION apply_ai_journey_patch(
  p_user_id uuid,
  p_patch jsonb,
  p_spec jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
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

  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(p_spec) LOOP
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
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
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
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_journey_patch(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_ai_journey_patch(uuid, jsonb, jsonb) TO authenticated;

COMMIT;
