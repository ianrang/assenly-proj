-- ============================================================
-- NEW-17: journeys AI patch RPC. Chat-First 시나리오에서 journey lazy-create.
-- 구조는 015 apply_ai_profile_patch와 동일 의미론.
-- 적용 방법: Supabase Dashboard SQL Editor에서 수동 실행
--
-- SG-3: INSERT 컬럼 목록에서 country/city 제외 → DEFAULT 'KR'/'seoul' 적용.
-- CR-1: array merge priority ordering (cur 우선 보존).
-- CR-2: IS DISTINCT FROM 가드 (FOUND 거짓양성 제거).
-- ============================================================

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
  -- active journey 확보 (lazy-create).
  -- SG-3: country/city는 INSERT 컬럼 목록에서 제외하여 schema.dbml DEFAULT 'KR'/'seoul' 적용.
  SELECT id INTO v_journey_id FROM journeys
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO journeys (user_id, status)
    VALUES (p_user_id, 'active')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_journey_id;

    -- ux_journeys_user_active 경합으로 이미 생성되었으면 재조회
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
      -- CR-2: 현 값 조회 후 NULL일 때만 쓰기, 실제 변경 시에만 applied.
      EXECUTE format(
        'SELECT %I::text FROM journeys WHERE id = $1',
        v_field
      ) INTO v_cur_scalar USING v_journey_id;

      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE journeys SET %I = $1 WHERE id = $2 AND %I IS NULL',
          v_field, v_field
        ) USING v_inc#>>'{}', v_journey_id;
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      -- CR-1 priority ordering + CR-2 IS DISTINCT FROM.
      v_max := (v_fspec->>'max')::int;

      EXECUTE format(
        'SELECT COALESCE(%I, ARRAY[]::text[]) FROM journeys WHERE id = $1',
        v_field
      ) INTO v_cur_arr USING v_journey_id;

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

COMMENT ON FUNCTION apply_ai_journey_patch IS
  'NEW-17 v1.1: AI 추출 patch를 journeys에 원자 적용. Chat-First lazy journey create.';
