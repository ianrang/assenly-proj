-- ============================================================
-- NEW-17d Red Team fixes (RT-1 CRITICAL + RT-2 Medium)
-- Spec: docs/superpowers/specs/2026-04-17-new17d-profile-edit-design.md v1.1
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행 (단일 트랜잭션)
--
-- 변경점 (vs 019b):
--   1. RT-1 CRITICAL: journeys.stay_days_user_updated_at 컬럼 추가.
--      - JOURNEY_FIELD_SPEC.stay_days 는 aiWritable=true 이나 019 에서 누락.
--      - apply_ai_journey_patch 가 SELECT stay_days_user_updated_at ... 실패 → 전체 RPC 실패.
--      - 기존 row 는 NULL (cooldown 미발동) → behavior unchanged.
--   2. RT-2 Medium: apply_user_explicit_edit RAISE EXCEPTION 에
--      USING ERRCODE = 'P0002' (no_data_found) 추가.
--      - service.ts 가 error.message regex 대신 error.code 로 안전 매핑.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- RT-1 CRITICAL: stay_days cooldown column (누락 보정)
-- ------------------------------------------------------------
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS stay_days_user_updated_at timestamptz NULL;

COMMENT ON COLUMN journeys.stay_days_user_updated_at IS
  'NEW-17d 019c: P-3 Time-Decay Lock (stay_days aiWritable=true). RT-1 누락 컬럼 보정.';

-- ------------------------------------------------------------
-- RT-2 Medium: apply_user_explicit_edit CREATE OR REPLACE
-- 019b 본문 verbatim + RAISE EXCEPTION USING ERRCODE = 'P0002'
-- ------------------------------------------------------------
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
  -- v1.1 RT-2: SQLSTATE P0002 (no_data_found) 로 명시 → service.ts 가 error.code 로 매핑.
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_profiles row not found for user_id %', p_user_id USING ERRCODE = 'P0002';
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
    -- 키 부재 = skip (patch 에 해당 필드 없음)
    IF v_inc IS NULL THEN CONTINUE; END IF;

    -- v1.1 §7.1 EC-3: null scalar = SET NULL (clear field)
    IF v_inc = 'null'::jsonb THEN
      IF v_fspec->>'cardinality' = 'scalar' THEN
        -- SET NULL only if current is NOT NULL (멱등성 유지)
        EXECUTE format('SELECT %I::text FROM %I WHERE %I = $1', v_field, v_table, v_key_col)
          INTO v_cur_scalar USING v_key_val;

        IF v_cur_scalar IS NOT NULL THEN
          EXECUTE format(
            'UPDATE %I SET %I = NULL%s WHERE %I = $1',
            v_table, v_field,
            CASE WHEN v_table = 'user_profiles' THEN ', updated_at = now()' ELSE '' END,
            v_key_col
          ) USING v_key_val;
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
        -- 이미 NULL 이면 no-op (멱등)
      END IF;
      -- array cardinality: null 무시 (defensive; zod 에서 차단됨)
      CONTINUE;
    END IF;

    -- real value path: REPLACE with IS DISTINCT FROM guard
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

-- v1.1 EC-4: service_role 미 grant (authenticated + RLS 만) — 019 와 동일
REVOKE ALL ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) IS
  'NEW-17d v1.1 + 019b + 019c: REPLACE + null scalar SET NULL + SQLSTATE P0002 on missing row. Red Team RT-1/RT-2 fix.';

COMMIT;
