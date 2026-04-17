-- ============================================================
-- Rollback for 019c_new17d_red_team_fixes.sql
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행 (단일 트랜잭션)
--
-- 되돌림:
--   1. journeys.stay_days_user_updated_at 컬럼 DROP.
--      주의: 이 컬럼이 NULL 이 아닌 row 가 있으면 stay_days AI 쓰기 cooldown 정보가 유실됨.
--            019 시점 이후 사용자 편집으로 NOT NULL 이 된 row 가 있는지 먼저 확인.
--   2. apply_user_explicit_edit 을 019b 본문(USING ERRCODE 없음)으로 복원.
-- ============================================================

BEGIN;

-- 1. 컬럼 DROP (019c 추가 분)
ALTER TABLE journeys
  DROP COLUMN IF EXISTS stay_days_user_updated_at;

-- 2. apply_user_explicit_edit 019b 본문으로 복원 (USING ERRCODE 제거)
CREATE OR REPLACE FUNCTION apply_user_explicit_edit(
  p_user_id       uuid,
  p_profile_patch jsonb,
  p_journey_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_profiles row not found for user_id %', p_user_id;
  END IF;

  IF p_journey_patch IS NOT NULL AND p_journey_patch <> '{}'::jsonb THEN
    v_journey_id := _ensure_active_journey(p_user_id);
  END IF;

  FOR v_field, v_fspec, v_table, v_key_col, v_key_val, v_patch IN
    SELECT key, value, 'user_profiles'::text, 'user_id'::text, p_user_id, p_profile_patch
      FROM jsonb_each(v_profile_spec)
    UNION ALL
    SELECT key, value, 'journeys'::text, 'id'::text, v_journey_id, p_journey_patch
      FROM jsonb_each(v_journey_spec)
     WHERE v_journey_id IS NOT NULL
  LOOP
    v_inc := v_patch->v_field;
    IF v_inc IS NULL THEN CONTINUE; END IF;

    IF v_inc = 'null'::jsonb THEN
      IF v_fspec->>'cardinality' = 'scalar' THEN
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
      CONTINUE;
    END IF;

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

REVOKE ALL ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) IS
  'NEW-17d v1.1 + 019b: 사용자 명시 편집 REPLACE + null scalar SET NULL (§7.1 EC-3). whitelist via spec loop (DC-1). service_role 미 grant (EC-4).';

COMMIT;
