-- ============================================================
-- NEW-17d: 프로필 편집 UX 경로
-- Spec: docs/superpowers/specs/2026-04-17-new17d-profile-edit-design.md v1.1
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행 (단일 트랜잭션)
-- ============================================================

BEGIN;

-- Step 1. user_profiles: AI-writable 필드 × user_updated_at 컬럼
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS skin_types_user_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS age_range_user_updated_at  timestamptz NULL;

COMMENT ON COLUMN user_profiles.skin_types_user_updated_at IS
  'NEW-17d: P-3 Time-Decay Lock. apply_user_explicit_edit 가 now() SET. AI patch 는 now() - get_user_edit_cooldown() 이내면 스킵.';
COMMENT ON COLUMN user_profiles.age_range_user_updated_at IS
  'NEW-17d: P-3 Time-Decay Lock (age_range, aiWritable=true).';

-- Step 2. journeys: AI-writable 필드 × user_updated_at
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS skin_concerns_user_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS budget_level_user_updated_at  timestamptz NULL;

COMMENT ON COLUMN journeys.skin_concerns_user_updated_at IS
  'NEW-17d: P-3 Time-Decay Lock (skin_concerns, aiWritable=true).';
COMMENT ON COLUMN journeys.budget_level_user_updated_at IS
  'NEW-17d: P-3 Time-Decay Lock (budget_level, aiWritable=true).';

-- Step 3. Cooldown SSOT (IMMUTABLE, v0.2 에서 STABLE + app_settings 로 전환)
CREATE OR REPLACE FUNCTION get_user_edit_cooldown() RETURNS interval
  LANGUAGE sql IMMUTABLE AS $$ SELECT INTERVAL '30 days' $$;

REVOKE ALL ON FUNCTION get_user_edit_cooldown() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_edit_cooldown() TO authenticated, service_role;

COMMENT ON FUNCTION get_user_edit_cooldown() IS
  'NEW-17d: P-3 Time-Decay Lock cooldown 기간 SSOT. TS USER_EDIT_COOLDOWN_DAYS 와 drift guard (T11) 로 동기.';

-- Step 3b. T11 drift guard 용 scalar wrapper
-- supabase-js 의 RPC 호출이 INTERVAL 반환을 안정적으로 파싱하지 못하므로 days 숫자로 래핑.
CREATE OR REPLACE FUNCTION get_user_edit_cooldown_days() RETURNS numeric
  LANGUAGE sql IMMUTABLE AS $$
    SELECT EXTRACT(EPOCH FROM get_user_edit_cooldown()) / 86400
  $$;

REVOKE ALL ON FUNCTION get_user_edit_cooldown_days() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_edit_cooldown_days() TO authenticated, service_role;

COMMENT ON FUNCTION get_user_edit_cooldown_days() IS
  'NEW-17d T11: Q-16 drift guard 용. get_user_edit_cooldown() 을 days(numeric) 로 래핑.';

-- Step 3c. _ensure_active_journey: race-safe lazy-create helper (DRY: CQ3)
-- apply_user_explicit_edit + apply_ai_journey_patch 양쪽에서 재사용.
CREATE OR REPLACE FUNCTION _ensure_active_journey(p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_journey_id uuid;
BEGIN
  SELECT id INTO v_journey_id FROM journeys
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;
  IF v_journey_id IS NULL THEN
    INSERT INTO journeys (user_id, status) VALUES (p_user_id, 'active')
    ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
    RETURNING id INTO v_journey_id;
    IF v_journey_id IS NULL THEN
      SELECT id INTO v_journey_id FROM journeys
       WHERE user_id = p_user_id AND status = 'active'
       LIMIT 1;
    END IF;
  END IF;
  RETURN v_journey_id;
END;
$$;

REVOKE ALL ON FUNCTION _ensure_active_journey(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _ensure_active_journey(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION _ensure_active_journey(uuid) IS
  'NEW-17d: internal helper. Returns active journey id for user, lazy-creating if missing. 재시도 안전 (ON CONFLICT + fallback SELECT).';

-- Step 4. apply_user_explicit_edit RPC — 사용자 명시 편집 (REPLACE semantic)
CREATE OR REPLACE FUNCTION apply_user_explicit_edit(
  p_user_id       uuid,
  p_profile_patch jsonb,
  p_journey_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp  -- NEW-17h defense-in-depth 선반영
AS $$
DECLARE
  v_profile_spec jsonb := get_profile_field_spec();
  v_journey_spec jsonb := get_journey_field_spec();
  v_journey_id   uuid;
  v_field        text;
  v_fspec        jsonb;
  v_table        text;
  v_key_col      text;
  v_key_val      uuid;
  v_patch        jsonb;
  v_inc          jsonb;
  v_applied_profile text[] := ARRAY[]::text[];
  v_applied_journey text[] := ARRAY[]::text[];
  v_cur_scalar   text;
  v_cur_arr      text[];
  v_inc_arr      text[];
  v_count        int;
BEGIN
  -- D3 방어: user_profiles row 존재 확인
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_profiles row not found for user_id %', p_user_id;
  END IF;

  -- Journey lazy-create (CQ3: _ensure_active_journey 헬퍼 사용)
  IF p_journey_patch IS NOT NULL AND p_journey_patch <> '{}'::jsonb THEN
    v_journey_id := _ensure_active_journey(p_user_id);
  END IF;

  -- CQ2: profile + journey REPLACE 를 UNION ALL 로 단일 loop 통합.
  -- v1.1 DC-1 whitelist 는 spec (patch 키 아님). journeys 는 updated_at 컬럼 없음 (001_initial_schema)
  -- → updated_at = now() 절은 user_profiles 전용 (CASE 로 조건부 삽입).
  FOR v_field, v_fspec, v_table, v_key_col, v_key_val, v_patch IN
    SELECT key, value, 'user_profiles'::text, 'user_id'::text, p_user_id, p_profile_patch
      FROM jsonb_each(v_profile_spec)
    UNION ALL
    SELECT key, value, 'journeys'::text, 'id'::text, v_journey_id, p_journey_patch
      FROM jsonb_each(v_journey_spec)
     WHERE v_journey_id IS NOT NULL
  LOOP
    v_inc := v_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_fspec->>'cardinality' = 'scalar' THEN
      EXECUTE format('SELECT %I::text FROM %I WHERE %I = $1', v_field, v_table, v_key_col)
        INTO v_cur_scalar USING v_key_val;

      IF v_cur_scalar IS DISTINCT FROM v_inc #>> '{}' THEN
        EXECUTE format(
          'UPDATE %I SET %I = (jsonb_populate_record(NULL::%I, jsonb_build_object(%L, $1))).%I%s WHERE %I = $2',
          v_table, v_field, v_table, v_field, v_field,
          CASE WHEN v_table = 'user_profiles' THEN ', updated_at = now()' ELSE '' END,
          v_key_col
        ) USING v_inc, v_key_val;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        -- v1.1 CI-1: identifier concat 후 %I quote
        IF v_count > 0 AND (v_fspec->>'aiWritable')::boolean THEN
          EXECUTE format('UPDATE %I SET %I = now() WHERE %I = $1',
                         v_table, v_field || '_user_updated_at', v_key_col)
            USING v_key_val;
        END IF;

        IF v_count > 0 AND v_table = 'user_profiles' THEN
          v_applied_profile := array_append(v_applied_profile, v_field);
        ELSIF v_count > 0 THEN
          v_applied_journey := array_append(v_applied_journey, v_field);
        END IF;
      END IF;
    ELSE
      -- array REPLACE (union 아님)
      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);
      v_inc_arr := COALESCE(v_inc_arr, ARRAY[]::text[]);

      EXECUTE format('SELECT COALESCE(%I, ARRAY[]::text[]) FROM %I WHERE %I = $1',
                     v_field, v_table, v_key_col)
        INTO v_cur_arr USING v_key_val;

      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_inc_arr THEN
        EXECUTE format(
          'UPDATE %I SET %I = $1%s WHERE %I = $2',
          v_table, v_field,
          CASE WHEN v_table = 'user_profiles' THEN ', updated_at = now()' ELSE '' END,
          v_key_col
        ) USING v_inc_arr, v_key_val;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        IF v_count > 0 AND (v_fspec->>'aiWritable')::boolean THEN
          EXECUTE format('UPDATE %I SET %I = now() WHERE %I = $1',
                         v_table, v_field || '_user_updated_at', v_key_col)
            USING v_key_val;
        END IF;

        IF v_count > 0 AND v_table = 'user_profiles' THEN
          v_applied_profile := array_append(v_applied_profile, v_field);
        ELSIF v_count > 0 THEN
          v_applied_journey := array_append(v_applied_journey, v_field);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- beauty_summary stale 방어 (v1.1 CI-4 멱등)
  IF (v_applied_profile <> ARRAY[]::text[] OR v_applied_journey <> ARRAY[]::text[]) THEN
    UPDATE user_profiles
       SET beauty_summary = NULL, updated_at = now()
     WHERE user_id = p_user_id
       AND beauty_summary IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'applied_profile', v_applied_profile,
    'applied_journey', v_applied_journey
  );
END;
$$;

-- v1.1 EC-4: service_role 미 grant (authenticated + RLS 만)
REVOKE ALL ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) IS
  'NEW-17d v1.1: 사용자 명시 편집 REPLACE. whitelist via spec loop (DC-1). service_role 미 grant (EC-4). user_updated_at 설정으로 AI cooldown 트리거.';

-- Step 5. apply_ai_profile_patch 개정 (cooldown check 추가)
-- 기존 017 의 함수를 DROP 후 CREATE
DROP FUNCTION IF EXISTS apply_ai_profile_patch(uuid, jsonb);

CREATE OR REPLACE FUNCTION apply_ai_profile_patch(
  p_user_id uuid,
  p_patch jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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
  v_user_ts timestamptz;
  v_cooldown interval := get_user_edit_cooldown();
BEGIN
  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(v_spec) LOOP
    -- aiWritable skip (먼저! v1.1 CI-5)
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    -- v1.1 cooldown check (aiWritable 통과 필드만 cooldown 컬럼 존재)
    EXECUTE format('SELECT %I FROM user_profiles WHERE user_id = $1',
                   v_field || '_user_updated_at')
      INTO v_user_ts USING p_user_id;
    IF v_user_ts IS NOT NULL AND v_user_ts > now() - v_cooldown THEN
      CONTINUE;  -- 사용자 최근 편집 존중
    END IF;

    -- 이하 기존 M1 + CR-1 merge 로직
    IF v_fspec->>'cardinality' = 'scalar' THEN
      EXECUTE format('SELECT %I::text FROM user_profiles WHERE user_id = $1', v_field)
        INTO v_cur_scalar USING p_user_id;
      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE user_profiles SET %I = (jsonb_populate_record(NULL::user_profiles, jsonb_build_object(%L, $1))).%I, updated_at = now() WHERE user_id = $2 AND %I IS NULL',
          v_field, v_field, v_field, v_field
        ) USING v_inc, p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      v_max := (v_fspec->>'max')::int;
      EXECUTE format('SELECT COALESCE(%I, ARRAY[]::text[]) FROM user_profiles WHERE user_id = $1', v_field)
        INTO v_cur_arr USING p_user_id;
      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);
      WITH merged AS (
        SELECT x, 0 AS pri, ord FROM unnest(v_cur_arr) WITH ORDINALITY AS t(x, ord)
        UNION ALL
        SELECT x, 1 AS pri, ord FROM unnest(COALESCE(v_inc_arr, ARRAY[]::text[])) WITH ORDINALITY AS t(x, ord)
      ),
      first_seen AS (
        SELECT DISTINCT ON (x) x, pri, ord FROM merged ORDER BY x, pri, ord
      )
      SELECT array_agg(x ORDER BY pri, ord)
      INTO v_new_arr
      FROM (SELECT x, pri, ord FROM first_seen ORDER BY pri, ord LIMIT v_max) t;
      v_new_arr := COALESCE(v_new_arr, ARRAY[]::text[]);

      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_new_arr THEN
        EXECUTE format('UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2', v_field)
          USING v_new_arr, p_user_id;
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
  'NEW-17d v1.1: apply_ai_profile_patch + cooldown check (aiWritable skip 뒤). service_role 전용.';

-- Step 6. apply_ai_journey_patch 개정 (cooldown check 추가)
DROP FUNCTION IF EXISTS apply_ai_journey_patch(uuid, jsonb);

CREATE OR REPLACE FUNCTION apply_ai_journey_patch(
  p_user_id uuid,
  p_patch jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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
  v_user_ts timestamptz;
  v_cooldown interval := get_user_edit_cooldown();
BEGIN
  -- CQ3: _ensure_active_journey 헬퍼 재사용 (race-safe 로직 단일 SSOT)
  v_journey_id := _ensure_active_journey(p_user_id);

  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(v_spec) LOOP
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    EXECUTE format('SELECT %I FROM journeys WHERE id = $1',
                   v_field || '_user_updated_at')
      INTO v_user_ts USING v_journey_id;
    IF v_user_ts IS NOT NULL AND v_user_ts > now() - v_cooldown THEN
      CONTINUE;
    END IF;

    -- 이하 기존 merge 로직 (017 에서 복사)
    IF v_fspec->>'cardinality' = 'scalar' THEN
      EXECUTE format('SELECT %I::text FROM journeys WHERE id = $1', v_field)
        INTO v_cur_scalar USING v_journey_id;
      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE journeys SET %I = (jsonb_populate_record(NULL::journeys, jsonb_build_object(%L, $1))).%I WHERE id = $2 AND %I IS NULL',
          v_field, v_field, v_field, v_field
        ) USING v_inc, v_journey_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      v_max := (v_fspec->>'max')::int;
      EXECUTE format('SELECT COALESCE(%I, ARRAY[]::text[]) FROM journeys WHERE id = $1', v_field)
        INTO v_cur_arr USING v_journey_id;
      SELECT array_agg(text_val) INTO v_inc_arr
        FROM jsonb_array_elements_text(v_inc) AS t(text_val);
      WITH merged AS (
        SELECT x, 0 AS pri, ord FROM unnest(v_cur_arr) WITH ORDINALITY AS t(x, ord)
        UNION ALL
        SELECT x, 1 AS pri, ord FROM unnest(COALESCE(v_inc_arr, ARRAY[]::text[])) WITH ORDINALITY AS t(x, ord)
      ),
      first_seen AS (
        SELECT DISTINCT ON (x) x, pri, ord FROM merged ORDER BY x, pri, ord
      )
      SELECT array_agg(x ORDER BY pri, ord)
      INTO v_new_arr
      FROM (SELECT x, pri, ord FROM first_seen ORDER BY pri, ord LIMIT v_max) t;
      v_new_arr := COALESCE(v_new_arr, ARRAY[]::text[]);

      IF COALESCE(v_cur_arr, ARRAY[]::text[]) IS DISTINCT FROM v_new_arr THEN
        EXECUTE format('UPDATE journeys SET %I = $1 WHERE id = $2', v_field)
          USING v_new_arr, v_journey_id;
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
  'NEW-17d v1.1: apply_ai_journey_patch + cooldown check. service_role 전용.';

-- Step 7. get_*_field_spec: v1.1 DC-1 authenticated GRANT 확장
-- apply_user_explicit_edit (SECURITY INVOKER, authenticated) 가 내부적으로 호출하므로 필요.
GRANT EXECUTE ON FUNCTION get_profile_field_spec() TO authenticated;
GRANT EXECUTE ON FUNCTION get_journey_field_spec() TO authenticated;

COMMIT;
