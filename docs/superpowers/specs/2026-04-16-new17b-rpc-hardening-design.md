# NEW-17b: RPC 보안 하드닝 + NEW-17e 통합 테스트 설계

- 작성일: 2026-04-16
- 정본 상태: v1.2 (T8 통합 테스트로 발견된 PL/pgSQL FOUND 버그 수정 — EXECUTE 후 GET DIAGNOSTICS ROW_COUNT 사용)
- 선행 설계: `2026-04-15-new17-profile-merge-policy-design.md` v1.1 (NEW-17 정본)
- CI/CD 정본 참조: `docs/03-design/INFRA-PIPELINE.md` v1.1 §3.5, §4 (A2 결정 근거)
- 관련 migration: `supabase/migrations/015_profile_skin_types_array.sql`, `015b_apply_ai_journey_patch.sql`
- 작업 단위: 단일 브랜치 `fix/new-17b-rpc-hardening-and-tests` (NEW-17b + NEW-17e 결합)

---

## §1. 배경

NEW-17에서 도입한 `apply_ai_profile_patch(uuid, jsonb, jsonb)` / `apply_ai_journey_patch(uuid, jsonb, jsonb)` RPC는 세 번째 인자 `p_spec`으로 "어느 필드가 `aiWritable`인가" 정책을 클라이언트에서 받는다. 코드 리뷰(보안 전문가)가 이를 위험 요소로 지적했다.

### 현재 위협 모델 재평가

- `user_profiles`, `journeys`에 **RLS가 활성화**되어 있고, 정책은 `auth.uid() = user_id` (setup-all.sql §278~§320).
- RPC는 `SECURITY INVOKER` → caller 권한으로 실행 → RLS 적용됨.
- 따라서 "타 사용자 데이터를 침해한다"는 공격은 **RLS가 이미 차단**한다.

### 그럼에도 해소해야 할 이유

본 PR이 해소하는 실제 위협은 다음 세 가지다.

1. **본인의 `aiWritable` 정책 위조로 API 검증 우회**
   - User A가 `p_spec`을 `{ "country": { "aiWritable": true, "cardinality": "scalar" } }` 로 위조 호출
   - RPC는 p_spec을 신뢰하여 country 필드에 patch 적용
   - 효과: User A는 `PUT /api/profile`의 zod enum 검증(country = ISO-3166-alpha-2)을 우회하여 **자기 자신의** country에 임의 문자열 저장 가능
   - 권한 상승은 아니지만 데이터 품질·M1 불변(사용자 명시값 보존) 규칙이 본인에 의해 우회됨.

2. **CHECK 제약 부재로 인한 허용값 범위 외 저장**
   - `skin_types`, `age_range`, `budget_level` 등의 허용값이 API zod에만 선언되어 있음.
   - PostgREST 외 모든 경로(RPC 위조, 추후 Dashboard 직접 편집, 스크립트 실수)에서 `['EXPLOIT']` 같은 임의 문자열 저장 가능.
   - 다운스트림(검색 필터, LLM 프롬프트)에 이 값이 전달되면 품질 저하·로그 오염.

3. **Defense in Depth 이중화**
   - 현재 정상성이 RLS에만 의존.
   - RLS 정책 변경 실수 / authenticated role에 대한 과도한 GRANT 추가 실수 등 **미래의 실수에 대한 내성** 확보.

### 등급 재평가

- TODO.md #507은 **CRITICAL**로 표기되어 있으나 RLS가 주 방어선임을 고려하면 실제 등급은 **HIGH (배포 전 해소 권장)** 이 타당.
- MVP 소프트런칭은 비차단, 정식 런칭 전 해소 필수.

---

## §2. 설계 결정

### §2.1 `p_spec` 저장 방식: **RPC 함수 본문 내부 상수** (하드코딩)

대안 비교 후 다음 근거로 하드코딩 채택:

- **YAGNI**: MVP~v0.3 범위에서 AI 쓰기 도메인은 2개(profile, journey)로 유지될 예정. NEW-17c `learned_preferences`는 필드 1개 추가로 기존 도메인에 병합. 메타 테이블 도입은 실제 확장 요구가 생길 때 리팩토링.
- **작업 범위 집중**: NEW-17b는 보안 하드닝. 저장 구조 리팩토링은 범위 분리가 깔끔.
- **Drift 감지**: 별도 읽기 전용 함수 `get_profile_field_spec()` / `get_journey_field_spec()`가 spec을 jsonb로 노출. **로컬**에서 `npm run test:integration` 실행 시 TS `PROFILE_FIELD_SPEC` / `JOURNEY_FIELD_SPEC`와 equality 비교하여 drift 감지 (T1).
  - **CI 자동 게이트 미포함**: `docs/03-design/INFRA-PIPELINE.md` v1.1 §3.5 정본 결정("GitHub Secrets는 사용하지 않는다") 및 §4("CI 책임은 코드 검증만")에 따라 CI에 Supabase 접근을 추가하지 않는다.
  - **보완책**: PR template 체크리스트 항목 + `CLAUDE.md` 규칙에 "drift 가능 변경 시 로컬 `npm run test:integration` 실행 필수" 명시 (구현 단계에서 반영).
  - **v0.2 경로**: INFRA-PIPELINE.md P3-26(Supabase dev/prod 분리) 완료 후 `NEW-17g` (TODO.md) 태스크로 CI integration test 통합 재평가.

### §2.2 RPC 시그니처 변경

```
apply_ai_profile_patch(uuid, jsonb, jsonb)   →   apply_ai_profile_patch(uuid, jsonb)
apply_ai_journey_patch(uuid, jsonb, jsonb)   →   apply_ai_journey_patch(uuid, jsonb)
```

기존 3-arg 버전은 `DROP FUNCTION`. 2-arg 버전을 `CREATE FUNCTION`. Overload 공존 방지.

### §2.3 권한 정책

- `REVOKE ALL FROM PUBLIC, authenticated`
- `GRANT EXECUTE TO service_role`
- 호출 경로: `src/server/features/api/routes/chat.ts:341, 372, 375` — 이미 `createServiceClient()` 사용 → 영향 없음.
- `get_*_field_spec()`는 **service_role 전용** (테스트 목적). 클라이언트가 spec을 런타임 조회할 필요 없음 (TS 상수로 충분).

### §2.4 CHECK 제약

`schema.dbml`에 note로 표기된 허용값을 DB 제약으로 승격:

| 테이블.컬럼 | CHECK |
|---|---|
| `user_profiles.skin_types` | `skin_types <@ ARRAY['dry','oily','combination','sensitive','normal']::text[]` |
| `user_profiles.age_range` | `age_range IN ('18-24','25-29','30-34','35-39','40-49','50+')` |
| `journeys.budget_level` | `budget_level IN ('budget','moderate','premium','luxury')` |

- 각 제약은 `NULL`을 허용 (미입력 상태 유지).
- 멱등 가드: 기존 제약(`user_profiles_skin_types_max_3`)과 동일 패턴 — `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ...) $$`.

---

## §3. Migration 017 구조

### §3.1 파일

`supabase/migrations/017_rpc_hardening.sql` (신규)

### §3.2 섹션 구성

트랜잭션으로 감싼다. Supabase Dashboard SQL Editor는 단일 statement 또는 `BEGIN;..COMMIT;`을 실행 가능. **아래 SQL은 구현 시 `017_rpc_hardening.sql`에 그대로 복사**하여 사용한다 (A1 보강 — 복붙 실수 차단).

```sql
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
-- 이 jsonb literal 본문은 src/shared/constants/profile-field-spec.ts의
-- PROFILE_FIELD_SPEC / JOURNEY_FIELD_SPEC를 JSON 직렬화한 값과 정확히 일치해야 한다.
-- Integration test T1이 로컬에서 이 일치를 검증.
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
-- 015 line 47-124의 merge 로직을 그대로 사용. 변경점: (1) p_spec 파라미터 제거
-- (2) FOR 루프의 jsonb_each(p_spec) → jsonb_each(v_spec). CR-1/CR-2 로직 보존.
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
      -- M3 + CR-2: 현 값 조회, NULL일 때만 set. jsonb_populate_record로 타입 자동 캐스트.
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
      -- CR-1: priority ordering (cur=0, inc=1)
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

      -- CR-2: IS DISTINCT FROM 가드
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
-- 015b의 lazy-create + merge 로직 그대로. 변경점: (1) p_spec 제거 (2) v_spec := get_journey_field_spec()
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
  -- SG-3: active journey lazy-create (country/city는 INSERT 제외 → DEFAULT 'KR'/'seoul' 적용)
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

-- Step 6. 권한 재설정 (A4: PUBLIC + anon + authenticated 모두 명시 REVOKE)
REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION apply_ai_journey_patch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_ai_journey_patch(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION get_profile_field_spec() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_field_spec() TO service_role;

REVOKE ALL ON FUNCTION get_journey_field_spec() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_journey_field_spec() TO service_role;

-- Step 7. COMMENT (검색/추적용)
COMMENT ON FUNCTION apply_ai_profile_patch(uuid, jsonb) IS
  'NEW-17b v1.2: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. spec은 get_profile_field_spec()으로 서버 고정. service_role 전용.';
COMMENT ON FUNCTION apply_ai_journey_patch(uuid, jsonb) IS
  'NEW-17b v1.2: journey AI 추출. spec은 get_journey_field_spec()으로 서버 고정. service_role 전용.';

COMMIT;
```

### §3.3 롤백 파일

`supabase/migrations/017_rpc_hardening_rollback.sql` (신규) — 비상 시 Supabase Dashboard 수동 실행. **A3 보강: 015/015b 본문 전체 inline 포함**. 아래 SQL을 그대로 복사.

```sql
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
```

**롤백 안전성**: CHECK 제약 DROP만 수행하며 `user_profiles.skin_types` / `age_range`, `journeys.budget_level` 기존 데이터는 영향 없음. 017 기간 중 유입된 레코드는 이미 CHECK를 통과한 상태이므로 추가 작업 불필요. 데이터 유실 없음.

---

## §4. TS 호출부 갱신

### §4.1 `src/server/features/profile/service.ts`

```diff
-import {
-  PROFILE_FIELD_SPEC,
-  JOURNEY_FIELD_SPEC,
-} from '@/shared/constants/profile-field-spec';
-
 export async function applyAiExtraction(
   client: SupabaseClient,
   userId: string,
   patch: Partial<UserProfileVars>,
 ): Promise<{ applied: string[] }> {
   const { data, error } = await client.rpc('apply_ai_profile_patch', {
     p_user_id: userId,
     p_patch: patch,
-    p_spec: PROFILE_FIELD_SPEC,
   });
   ...
 }
```

`applyAiExtractionToJourney` 동일.

**C1 보강**: service.ts에서 `PROFILE_FIELD_SPEC` / `JOURNEY_FIELD_SPEC` import를 **제거한다** (호출부에서 사용하지 않음). 상수는 `merge.ts` (computeProfilePatch) 및 integration test T1(drift 비교)에서 직접 import하여 사용 — service.ts 경유 불필요. CLAUDE.md G-4 (미사용 코드 금지) 준수.

### §4.2 `src/server/features/profile/service.test.ts`

기존 M4 테스트 "PROFILE_FIELD_SPEC만 전달 (레지스트리 혼동 방지)" 의미 재정의:

- 이전: mock rpc 호출 시 3번째 인자로 `PROFILE_FIELD_SPEC`이 전달되는지 검증
- **신규 (C2 보강)**: mock rpc 호출이 **정확히 `{ p_user_id, p_patch }` 두 키만** 포함하는지 **exact match assertion**으로 검증. 서버 고정 확인 + 미래에 `p_spec` 키가 실수로 복원되면 즉시 실패.

예:
```ts
expect(rpcMock).toHaveBeenCalledWith('apply_ai_profile_patch', {
  p_user_id: 'user-1',
  p_patch: { skin_types: ['dry'] },
});
// `toHaveBeenCalledWith`는 deep strict match이므로 추가 키가 있으면 fail
```

JOURNEY 테스트 동일 패턴. Mock signature도 2-arg로 수정.

### §4.3 `src/server/features/api/routes/chat.test.ts`

해당 파일은 `applyAiExtraction` 래퍼를 mock하므로 RPC 시그니처 변경과 직접 무관. 단 mock assertion이 rpc 호출의 3번째 인자를 검증하는 경우 해당 assert 삭제. 구현 시 파일 grep으로 `p_spec` / `PROFILE_FIELD_SPEC` / 3-arg 패턴 확인 후 처리.

---

## §5. NEW-17e 통합 테스트

### §5.1 파일

- `src/__tests__/integration/profile-routes.integration.test.ts` — 기존 파일에 describe 블록 추가
- `src/__tests__/integration/rpc-hardening.integration.test.ts` — 신규, RPC 레벨 직접 검증

### §5.2 테스트 케이스

**T1. Spec drift guard**
- `service_role` client로 `rpc('get_profile_field_spec')` 호출
- 결과를 `PROFILE_FIELD_SPEC` (TS 상수)과 deep equal 비교
- `get_journey_field_spec` / `JOURNEY_FIELD_SPEC` 동일
- Key 순서 정규화: `Object.entries(spec).sort(([a],[b]) => a.localeCompare(b))` 후 `JSON.stringify` 비교 (jsonb는 내부 정렬됨)

**T2. M1 사용자값 불변 (profile)**
- Setup: 온보딩 POST → `skin_types=['dry']`, `country='US'`, `age_range='25-29'`
- Action: `service_role.rpc('apply_ai_profile_patch', { p_user_id, p_patch: { skin_types:['oily'], country:'KR', age_range:'30-34' } })`
- Assert: `skin_types=['dry','oily']`, `country='US'`, `age_range='25-29'` (unchanged)
- Returned `applied`: `['skin_types']` 만 포함

**T3. skin_types cap 절단 금지 (M1 + CR-1)**
- Setup: `skin_types=['dry','oily','combination']` (cap=3 도달)
- Action: AI patch `skin_types=['sensitive','normal']`
- Assert: `['dry','oily','combination']` 불변. `applied` 는 빈 배열 (IS DISTINCT FROM 가드).

**T4. Lazy-create journey (SG-3)**
- Setup: 신규 테스트 사용자 (journey 레코드 없음)
- Action: `rpc('apply_ai_journey_patch', { p_user_id, p_patch: { skin_concerns:['acne'] } })`
- Assert:
  - journeys 테이블에 새 레코드 존재
  - `country='KR'`, `city='seoul'` (schema.dbml DEFAULT)
  - `status='active'`, `skin_concerns=['acne']`

**T5. REVOKE 검증 — 4개 함수 전수 (A5 보강)**
- Authenticated token을 가진 client(PostgREST)로 다음 4개 RPC 호출 모두 거부되는지 확인:
  1. `apply_ai_profile_patch(p_user_id, p_patch)`
  2. `apply_ai_journey_patch(p_user_id, p_patch)`
  3. `get_profile_field_spec()`
  4. `get_journey_field_spec()`
- Assert: 모두 응답 에러 코드 `42501` (insufficient_privilege) 또는 PostgREST `PGRST202` / `PGRST301`
- Expect는 `error.code`와 `status >= 400` 둘 다 체크하여 환경별 매핑 차이에 대응 (spec §7 R5)

**T6. CHECK 제약 방어**
- `service_role` client로 잘못된 값 직접 UPDATE:
  - `UPDATE user_profiles SET skin_types = ARRAY['EXPLOIT']::text[] WHERE user_id = ...` → error `23514`
  - `UPDATE user_profiles SET age_range = 'invalid'` → error `23514`
  - `UPDATE journeys SET budget_level = 'bogus'` → error `23514`

**T7. journey M1 대칭 케이스 (G1-G4 보강)**
- Setup: `apply_ai_journey_patch(p_user_id, p_patch: { skin_concerns: ['acne','pores'] })` 로 journey 생성 + skin_concerns 저장
- Action: `apply_ai_journey_patch(p_user_id, p_patch: { skin_concerns: ['dryness'], interest_activities: ['shopping'], travel_style: ['efficient'] })`
- Assert:
  - `skin_concerns = ['acne','pores','dryness']` (array union, CR-1 priority: 기존값 우선)
  - `interest_activities` 불변 (aiWritable=false, 변경 없음)
  - `travel_style` 불변 (aiWritable=false)
  - Returned `applied`: `['skin_concerns']` 만

**T8. scalar NULL → AI set (M3 명시 증명)**
- Setup: `age_range=NULL` 사용자 (온보딩 미입력 가정)
- Action: `apply_ai_profile_patch(p_user_id, p_patch: { age_range: '25-29' })`
- Assert: `age_range = '25-29'` (scalar가 NULL일 때만 AI가 set 가능)
- 추가: Action 재실행 `p_patch: { age_range: '30-34' }` → `age_range = '25-29'` 불변 (M1: 일단 set되면 AI가 덮어쓰기 불가)

### §5.3 테스트 환경

`src/__tests__/integration/helpers.ts`가 이미 제공:
- `createRegisteredTestUser()` → anonymous auth session + users/user_profiles/journeys 초기화
- Anon client (authenticated token)
- Service role client
- `cleanupTestUser(userId)`

신규 환경 추가 불필요.

---

## §6. 적용 시퀀스

### §6.1 개발 순서 (TDD)

1. **통합 테스트 6건 먼저 작성** — 모두 red 상태
2. `017_rpc_hardening.sql` 작성 + 로컬 review
3. **사용자**가 Supabase Dashboard에서 017 수동 적용
4. `service.ts` / `service.test.ts` / `chat.test.ts` 갱신
5. 통합 테스트 green 확인 (`npm run test:integration`)
6. 전수 검증:
   - `npm run type-check`
   - `npm run lint`
   - `npm run build`
   - `npm test` (unit)
   - `npm run test:integration`
7. `/gstack-plan-eng-review` — 전문가 플랜 리뷰 (완료 — 본 문서 v1.1 반영)
8. 필요 시 수정 후 PR

### §6.1.1 PR 체크리스트 (A2 보강)

PR description에 다음 체크박스 포함:

```markdown
## NEW-17b Pre-merge Checklist
- [ ] `npm run test:integration` 로컬 실행 통과 (T1~T8)
- [ ] `017_rpc_hardening.sql` Supabase Dashboard 적용 완료
- [ ] `SELECT proname, pronargs FROM pg_proc WHERE proname IN ('apply_ai_profile_patch','apply_ai_journey_patch')` 결과 2 rows 확인
- [ ] `CLAUDE.md`에 "drift 가능 필드 변경 시 로컬 integration test 실행 필수" 규칙 추가
```

### §6.2 배포 순서

1. PR 머지 (code only — migration 017 파일만 커밋됨, 실제 적용 안 됨)
2. **사용자**가 Supabase Dashboard에서 017 수동 적용
3. Vercel 배포 (service.ts가 2-arg RPC 호출 시작)
4. 검증:
   ```sql
   SELECT proname, pronargs FROM pg_proc
    WHERE proname IN ('apply_ai_profile_patch','apply_ai_journey_patch');
   -- 기대: 2 rows, pronargs = 2
   ```

### §6.3 롤백 경로

- **코드만 롤백**: 이전 커밋 revert → Vercel 재배포. service.ts가 3-arg 호출 시도 → RPC 없음 → 500. **017_rpc_hardening_rollback.sql** 병행 적용 필수.
- **DB만 롤백**: 017 파일과 015/015b의 차이 역으로 적용 (3-arg 버전 재생성 + GRANT authenticated 복원). 코드는 2-arg 유지 → RPC 없음 → 500. **코드 롤백 병행 필수**.
- **양쪽 롤백**: 코드 revert + 017_rpc_hardening_rollback.sql 실행 → 동시.

---

## §7. 리스크와 완화

| # | 리스크 | 완화 |
|---|---|---|
| R1 | DROP + CREATE 사이 RPC 부재 window (ms 단위) | 017을 `BEGIN; ... COMMIT;`로 감싸 트랜잭션 내 원자 교체 |
| R2 | 기존 data에 CHECK 위반 row 존재 | 017 Step 1에서 pre-check `RAISE EXCEPTION`. 적용 자체 실패 → 사용자가 선 수정 후 재시도 |
| R3 | Drift test의 JSON key 순서 민감성 | `jsonb`는 내부 알파벳 정렬 → TS 측에서도 정규화 후 비교 |
| R4 | service_role 키 노출 시 방어 무력화 | 본 PR 범위 밖. 키 관리 정책은 기존 .env/Vercel secrets 유지 |
| R5 | NEW-17e T5 REVOKE 테스트가 환경별 에러 코드 차이 | Supabase PostgREST는 `42501` 매핑. expect는 `error.code`와 `status >= 400` 둘 다 체크 |
| R6 | 배포 윈도우 (017 적용 ~ 코드 배포) 동안 기존 3-arg 호출 시도 실패 | 트랜잭션 순서: 017 적용 → 즉시 Vercel 배포. 관측 후 이상 시 롤백 절차 R1~R3 참조 |

---

## §8. 검증 체크리스트 (CLAUDE.md V-* 규칙 매핑)

- [ ] V-1~V-6: 의존성 / Composition Root / 콜스택 / 바인딩 — service.ts `applyAiExtraction`은 route handler에서 호출되는 단일 경로 유지
- [ ] V-7~V-8: beauty/ 순수성 — 본 PR 미접촉
- [ ] V-9~V-10: 중복 / 미사용 코드 — `PROFILE_FIELD_SPEC`는 merge.ts + integration test에서 유지 (미사용 X)
- [ ] V-12: any 타입 — RPC 응답 `(data as string[]) ?? []` 기존 패턴 유지
- [ ] V-19~V-22: 복합 쓰기 / FK / 스키마 정합성 — RPC는 단일 트랜잭션. CHECK 제약이 schema.dbml의 note 값과 일치
- [ ] V-23~V-25: 설계 교차 검증 / 수정 영향 / 정본 — NEW-17 정본(2026-04-15 spec v1.1)과 호환. Tool-spec / api-spec 영향 없음 (API 시그니처 불변)
- [ ] Q-1 zod 검증: API 입력은 기존 zod 유지. RPC는 CHECK 제약으로 2차 방어
- [ ] Q-14 스키마 정합성: CHECK 제약 허용값과 zod enum, schema.dbml note, TS constants의 4곳이 Integration test T1/T6으로 cross-verify

---

## §9. 범위 외

- **NEW-17c** `learned_preferences` 재도입 — 별도 v0.2 후보
- **NEW-17d** 프로필 편집 UX 경로 — 별도 세션 (제품 결정 필요)
- **NEW-17f** 배포 윈도우 trigger — 별도 세션 (우선순위 낮음)
- **NEW-17g** Integration test CI 통합 — v0.2 P3-26 (Supabase dev/prod 분리) 완료 후. `docs/03-design/INFRA-PIPELINE.md` §3.5 개정 동반 필요. 본 PR은 로컬 규율 + PR 체크리스트로 대체
- 메타 테이블(`ai_field_spec`) 리팩토링 — YAGNI. 도메인 3개 이상 확장 요구 시 재평가
- `learned_preferences` 또는 신규 aiWritable 필드 추가는 spec 함수 2곳(`get_*_field_spec()`) + TS 상수 1곳 수정으로 대응 (NEW-17c 작업 시)

---

## §10. 정본 우선순위 확인 (D-11)

- `schema.dbml` §98~§125: `skin_types text[]`, `age_range text`, `budget_level text`, journeys DEFAULT 'KR'/'seoul' — ✓ 일치
- `PRD.md` §4-A: 온보딩 시 사용자 명시값 우선 — ✓ M1과 일치
- `TDD.md`: AI 추출 경로 설계 — ✓ 기존 RPC 의미 불변
- **`INFRA-PIPELINE.md` v1.1 §3.5 (CI/CD 정본)**: "GitHub Secrets 미사용", "CI는 코드 검증만" — ✓ A2 결정 근거 (CI에 integration job 미추가)
- 2026-04-15 spec v1.1 (NEW-17 정본): M1/M2/M3/M5 규칙 — ✓ 본 설계는 보안 레이어만 추가하며 의미 보존

## §11. 변경 이력

| 날짜 | 버전 | 변경 |
|------|------|------|
| 2026-04-16 | v1.0 | 초안 |
| 2026-04-16 | v1.1 | `/gstack-plan-eng-review` 반영: A1(migration SQL inline), A3(rollback SQL inline), A4(anon REVOKE), A5(T5 4함수 확장), C1(service.ts import 제거), C2(exact match assertion), G1-G4(T7/T8 journey 대칭/scalar NULL 테스트 추가), A2 결정(INFRA-PIPELINE.md 정본 일치 → 로컬 규율 + NEW-17g 분리). §6.1.1 PR 체크리스트 신설 |
| 2026-04-16 | v1.2 | Integration test T8로 발견된 PL/pgSQL FOUND 버그 수정: `EXECUTE format(...)` 후 `IF FOUND` → `GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0` 패턴으로 교체. scalar branch는 FOUND=false로 applied 누락, array branch는 stale FOUND=true로 오탐 가능. 두 RPC 함수 각 2곳씩 총 4곳 수정. rollback SQL은 015/015b 원형 유지 (pre-017 상태 복원 목적) |
