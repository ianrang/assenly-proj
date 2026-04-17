-- ============================================================
-- NEW-17b: RPC 보안 하드닝 + CHECK 제약
-- Spec: docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md v1.2
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행 (단일 트랜잭션)
-- ============================================================

BEGIN;

-- Step 1. 기존 data가 신규 CHECK 제약을 위반하지 않는지 선검증
DO $$
DECLARE v_bad bigint;
BEGIN
  -- skin_types
  SELECT count(*) INTO v_bad FROM user_profiles
   WHERE skin_types IS NOT NULL
     AND NOT (skin_types <@ ARRAY['dry','oily','combination','sensitive','normal']::text[]);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Pre-check failed: % rows violate skin_types enum. Fix before migration 017.', v_bad;
  END IF;

  -- age_range
  SELECT count(*) INTO v_bad FROM user_profiles
   WHERE age_range IS NOT NULL
     AND age_range NOT IN ('18-24','25-29','30-34','35-39','40-49','50+');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Pre-check failed: % rows violate age_range enum. Fix before migration 017.', v_bad;
  END IF;

  -- budget_level
  SELECT count(*) INTO v_bad FROM journeys
   WHERE budget_level IS NOT NULL
     AND budget_level NOT IN ('budget','moderate','premium','luxury');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Pre-check failed: % rows violate budget_level enum. Fix before migration 017.', v_bad;
  END IF;
END $$;

-- Step 2. 구 3-arg RPC DROP (overload 충돌 방지)
DROP FUNCTION IF EXISTS apply_ai_profile_patch(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS apply_ai_journey_patch(uuid, jsonb, jsonb);

-- Step 3. Spec 읽기 전용 함수 (Drift test 및 RPC 내부 사용)
CREATE OR REPLACE FUNCTION get_profile_field_spec() RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT '{
      "skin_types":   {"cardinality":"array","aiWritable":true,"max":3},
      "hair_type":    {"cardinality":"scalar","aiWritable":false},
      "hair_concerns":{"cardinality":"array","aiWritable":false,"max":6},
      "country":      {"cardinality":"scalar","aiWritable":false},
      "language":     {"cardinality":"scalar","aiWritable":false},
      "age_range":    {"cardinality":"scalar","aiWritable":true}
    }'::jsonb
  $$;

CREATE OR REPLACE FUNCTION get_journey_field_spec() RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT '{
      "skin_concerns":      {"cardinality":"array","aiWritable":true,"max":5},
      "interest_activities":{"cardinality":"array","aiWritable":false,"max":5},
      "stay_days":          {"cardinality":"scalar","aiWritable":true},
      "start_date":         {"cardinality":"scalar","aiWritable":false},
      "end_date":           {"cardinality":"scalar","aiWritable":false},
      "budget_level":       {"cardinality":"scalar","aiWritable":true},
      "travel_style":       {"cardinality":"array","aiWritable":false,"max":7}
    }'::jsonb
  $$;

-- Step 4. 신 2-arg apply_ai_profile_patch
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

-- Step 4b. 신 2-arg apply_ai_journey_patch
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

-- Step 5. CHECK 제약 3건 (멱등 가드)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_skin_types_values') THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_skin_types_values
      CHECK (skin_types IS NULL OR skin_types <@ ARRAY['dry','oily','combination','sensitive','normal']::text[]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_age_range_values') THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_age_range_values
      CHECK (age_range IS NULL OR age_range IN ('18-24','25-29','30-34','35-39','40-49','50+'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journeys_budget_level_values') THEN
    ALTER TABLE journeys
      ADD CONSTRAINT journeys_budget_level_values
      CHECK (budget_level IS NULL OR budget_level IN ('budget','moderate','premium','luxury'));
  END IF;
END $$;

-- Step 6. 권한 재설정
REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION apply_ai_journey_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_journey_patch(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION get_profile_field_spec() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_field_spec() TO service_role;

REVOKE ALL ON FUNCTION get_journey_field_spec() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_journey_field_spec() TO service_role;

-- Step 7. COMMENT
COMMENT ON FUNCTION apply_ai_profile_patch(uuid, jsonb) IS
  'NEW-17b v1.2: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. spec은 get_profile_field_spec()으로 서버 고정. service_role 전용.';
COMMENT ON FUNCTION apply_ai_journey_patch(uuid, jsonb) IS
  'NEW-17b v1.2: journey AI 추출. spec은 get_journey_field_spec()으로 서버 고정. service_role 전용.';

COMMIT;
