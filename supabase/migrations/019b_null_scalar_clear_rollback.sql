-- ============================================================
-- Rollback for 019b_null_scalar_clear.sql
--
-- 019b 를 취소하고 apply_user_explicit_edit 를 019 상태로 되돌림.
-- 019 의 함수 정의를 CREATE OR REPLACE 로 복원 — 최상단에서 null 과 key absent 를
-- 동일하게 skip 처리하는 기존 동작.
-- 019 의 full rollback 이 아님: 019 의 기타 오브젝트(컬럼, 헬퍼, 다른 RPC) 는 그대로 유지.
-- 019 전체 rollback 이 필요하면 019_new17d_user_explicit_edit_rollback.sql 을 사용.
-- ============================================================

BEGIN;

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
  'NEW-17d v1.1 (019b rolled back): 사용자 명시 편집 REPLACE. null scalar 은 skip (019 동작). whitelist via spec loop (DC-1). service_role 미 grant (EC-4).';

COMMIT;
