# NEW-17b RPC 보안 하드닝 + NEW-17e 통합 테스트 — 구현 플랜

> **⚠️ Executed-as amendment (2026-04-16)**: 이 플랜은 작성 시점 spec v1.1 기준이다. 실행 중 통합 테스트 T8에서 발견된 PL/pgSQL `FOUND` 버그 수정이 추가되어 **spec v1.2 + commit `0cd80a1`**로 반영됨. 본 문서 Task 1 Step 1의 embedded SQL은 v1.1 원문이므로, 플랜을 재실행할 경우 반드시 **현재 `supabase/migrations/017_rpc_hardening.sql` 파일을 그대로 사용**하거나 spec v1.2 §3.2를 참조할 것. 차이점: `IF FOUND` 4곳 → `GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN` + 양 함수 DECLARE 블록에 `v_count int;` 추가.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RPC `p_spec` 인자 제거 + 서버 고정 + REVOKE/GRANT + CHECK 제약 + 통합 테스트로 DB 레벨 보안 하드닝 완료

**Architecture:** 기존 3-arg RPC(`p_user_id, p_patch, p_spec`)를 2-arg(`p_user_id, p_patch`)로 교체. spec은 RPC 내부 `get_*_field_spec()` 호출로 서버 고정. 권한을 `service_role` 전용으로 변경. CHECK 제약으로 허용값 DB 레벨 강제.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Vitest, Supabase JS SDK

**Spec 정본:** `docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` v1.2 (v1.1 + FOUND 버그 수정)

**실행 상태**: ✅ 완료 (2026-04-16). 전수 검증: type-check + lint + build + unit 907/907 + integration 124/124 모두 PASS. 커밋 시퀀스: 613a13b → c4da460 → be2b066 → 699d72f → **0cd80a1 (FOUND fix)** → 05bac3e → 87104b4 → 31e9a5e. PR 미생성.

---

## 파일 맵

| 작업 | 파일 | 역할 |
|------|------|------|
| Create | `supabase/migrations/017_rpc_hardening.sql` | Migration: DROP 3-arg → CREATE 2-arg + CHECK 제약 + REVOKE/GRANT |
| Create | `supabase/migrations/017_rpc_hardening_rollback.sql` | 롤백: 3-arg 복원 + CHECK DROP + GRANT authenticated 복원 |
| Create | `src/__tests__/integration/rpc-hardening.integration.test.ts` | T1~T8 통합 테스트 |
| Modify | `src/server/features/profile/service.ts:4-7,237-241,262-266` | `p_spec` 인자 제거 + 미사용 import 제거 |
| Modify | `src/server/features/profile/service.test.ts:286-382` | M4 테스트를 exact match 2-arg 검증으로 재정의 |

---

## Task 1: Migration 017 작성

**Files:**
- Create: `supabase/migrations/017_rpc_hardening.sql`
- Create: `supabase/migrations/017_rpc_hardening_rollback.sql`

> Migration 파일은 spec §3.2, §3.3의 SQL을 그대로 복사. 로직 변경 없음.

- [ ] **Step 1: 017_rpc_hardening.sql 작성**

spec §3.2 전체 SQL 복사. 내용 요약:
1. Pre-check: 기존 데이터 CHECK 위반 여부 검증
2. DROP 3-arg RPC 2개
3. CREATE `get_profile_field_spec()` / `get_journey_field_spec()` (IMMUTABLE, jsonb 반환)
4. CREATE 2-arg `apply_ai_profile_patch(uuid, jsonb)` / `apply_ai_journey_patch(uuid, jsonb)`
5. CHECK 제약 3건 (멱등 가드)
6. REVOKE ALL FROM PUBLIC, anon, authenticated + GRANT TO service_role (4개 함수)
7. COMMENT

```sql
-- ============================================================
-- NEW-17b: RPC 보안 하드닝 + CHECK 제약
-- Spec: docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md v1.1
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
  'NEW-17b v1.1: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. spec은 get_profile_field_spec()으로 서버 고정. service_role 전용.';
COMMENT ON FUNCTION apply_ai_journey_patch(uuid, jsonb) IS
  'NEW-17b v1.1: journey AI 추출. spec은 get_journey_field_spec()으로 서버 고정. service_role 전용.';

COMMIT;
```

- [ ] **Step 2: 017_rpc_hardening_rollback.sql 작성**

spec §3.3 전체 SQL 복사. 내용:
1. CHECK 제약 DROP 3건
2. 신 2-arg RPC DROP 4개 (apply 2 + get 2)
3. 구 3-arg `apply_ai_profile_patch(uuid, jsonb, jsonb)` 재생성 (015 동일)
4. 구 3-arg `apply_ai_journey_patch(uuid, jsonb, jsonb)` 재생성 (015b 동일)
5. REVOKE FROM PUBLIC + GRANT TO authenticated (원래 권한 복원)

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

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_rpc_hardening.sql supabase/migrations/017_rpc_hardening_rollback.sql
git commit -m "feat(NEW-17b): migration 017 RPC 하드닝 + rollback SQL 추가

- 3-arg RPC → 2-arg 교체 (p_spec 서버 고정)
- get_*_field_spec() 읽기 전용 함수 추가
- CHECK 제약 3건 (skin_types, age_range, budget_level)
- REVOKE authenticated + GRANT service_role (4개 함수)
- 롤백 SQL: 3-arg 복원 + CHECK DROP + GRANT authenticated"
```

---

## Task 2: 통합 테스트 T1~T8 작성 (Red)

**Files:**
- Create: `src/__tests__/integration/rpc-hardening.integration.test.ts`

> **전제**: 이 테스트는 사용자가 Supabase Dashboard에서 017을 적용한 후에만 green이 됨. 작성 시점에는 전부 red (또는 skip).

- [ ] **Step 1: rpc-hardening.integration.test.ts 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  type TestSession,
} from './helpers';
import { createClient } from '@supabase/supabase-js';
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from '@/shared/constants/profile-field-spec';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe('RPC Hardening (integration)', () => {
  let userA: TestSession;
  let userB: TestSession;
  let userC: TestSession;
  const admin = createVerifyClient();

  beforeAll(async () => {
    userA = await createRegisteredTestUser();
    userB = await createRegisteredTestUser();
    userC = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
    await cleanupTestUser(userC.userId);
  });

  // ── T1: Spec drift guard ──────────────────────────────────
  describe('T1: Spec drift guard', () => {
    it('get_profile_field_spec() matches TS PROFILE_FIELD_SPEC', async () => {
      const { data, error } = await admin.rpc('get_profile_field_spec');
      expect(error).toBeNull();

      const dbSpec = data as Record<string, unknown>;
      const tsSpec = JSON.parse(JSON.stringify(PROFILE_FIELD_SPEC));

      // jsonb는 키를 알파벳 정렬. 양쪽 정규화 후 비교.
      const normalize = (obj: Record<string, unknown>) =>
        JSON.stringify(
          Object.entries(obj)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, v]),
        );

      expect(normalize(dbSpec)).toBe(normalize(tsSpec));
    });

    it('get_journey_field_spec() matches TS JOURNEY_FIELD_SPEC', async () => {
      const { data, error } = await admin.rpc('get_journey_field_spec');
      expect(error).toBeNull();

      const dbSpec = data as Record<string, unknown>;
      const tsSpec = JSON.parse(JSON.stringify(JOURNEY_FIELD_SPEC));

      const normalize = (obj: Record<string, unknown>) =>
        JSON.stringify(
          Object.entries(obj)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, v]),
        );

      expect(normalize(dbSpec)).toBe(normalize(tsSpec));
    });
  });

  // ── T2: M1 사용자값 불변 (profile) ────────────────────────
  describe('T2: M1 사용자값 불변 (profile)', () => {
    it('AI patch는 기존 사용자값을 덮어쓰지 않고 배열은 union', async () => {
      // Setup: 온보딩으로 프로필 생성
      await admin.from('user_profiles').upsert({
        user_id: userA.userId,
        skin_types: ['dry'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Action: AI가 모든 aiWritable 필드에 다른 값을 제안
      const { data, error } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: {
          skin_types: ['oily'],
          country: 'KR',       // aiWritable=false → 무시됨
          age_range: '30-34',  // 이미 값 있음 → M1 보존
        },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual(['skin_types']);

      // Assert: DB 확인
      const { data: row } = await admin
        .from('user_profiles')
        .select('skin_types, country, age_range')
        .eq('user_id', userA.userId)
        .single();

      expect(row!.skin_types).toEqual(['dry', 'oily']); // union
      expect(row!.country).toBe('US');                   // 불변
      expect(row!.age_range).toBe('25-29');              // 불변
    });
  });

  // ── T3: skin_types cap 절단 금지 ──────────────────────────
  describe('T3: skin_types cap 절단 금지 (M1 + CR-1)', () => {
    it('cap=3 도달 시 AI 추가값 무시', async () => {
      // Setup: cap 도달
      await admin.from('user_profiles').update({
        skin_types: ['dry', 'oily', 'combination'],
      }).eq('user_id', userA.userId);

      // Action
      const { data, error } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_types: ['sensitive', 'normal'] },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual([]); // IS DISTINCT FROM 가드 → 변경 없음

      const { data: row } = await admin
        .from('user_profiles')
        .select('skin_types')
        .eq('user_id', userA.userId)
        .single();

      expect(row!.skin_types).toEqual(['dry', 'oily', 'combination']);
    });
  });

  // ── T4: Lazy-create journey (SG-3) ────────────────────────
  describe('T4: Lazy-create journey (SG-3)', () => {
    it('journey 레코드 없는 사용자에게 AI patch → 자동 생성', async () => {
      // Setup: userB는 journey 없음 (createRegisteredTestUser는 journey 미생성)
      // 프로필은 있어야 함 (RPC가 profile 테이블을 접근하지 않지만 일관성 위해)

      const { data, error } = await admin.rpc('apply_ai_journey_patch', {
        p_user_id: userB.userId,
        p_patch: { skin_concerns: ['acne'] },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toContain('skin_concerns');

      // Assert: journey 레코드 확인
      const { data: journey } = await admin
        .from('journeys')
        .select('status, country, city, skin_concerns')
        .eq('user_id', userB.userId)
        .eq('status', 'active')
        .single();

      expect(journey).not.toBeNull();
      expect(journey!.status).toBe('active');
      expect(journey!.country).toBe('KR');    // schema.dbml DEFAULT
      expect(journey!.city).toBe('seoul');     // schema.dbml DEFAULT
      expect(journey!.skin_concerns).toEqual(['acne']);
    });
  });

  // ── T5: REVOKE 검증 — 4개 함수 전수 ──────────────────────
  describe('T5: REVOKE 검증 (authenticated 거부)', () => {
    /**
     * authenticated token을 가진 client(PostgREST)로 RPC 호출 시 거부 확인.
     * Supabase PostgREST는 42501 → PGRST202/301 매핑.
     * error.code 또는 status >= 400 체크.
     */
    function createAuthClient(token: string) {
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    }

    it('apply_ai_profile_patch → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error } = await client.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_types: ['dry'] },
      });
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
    });

    it('apply_ai_journey_patch → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error } = await client.rpc('apply_ai_journey_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_concerns: ['acne'] },
      });
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
    });

    it('get_profile_field_spec → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error } = await client.rpc('get_profile_field_spec');
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
    });

    it('get_journey_field_spec → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error } = await client.rpc('get_journey_field_spec');
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
    });
  });

  // ── T6: CHECK 제약 방어 ───────────────────────────────────
  describe('T6: CHECK 제약 방어', () => {
    it('잘못된 skin_types → 23514', async () => {
      const { error } = await admin
        .from('user_profiles')
        .update({ skin_types: ['EXPLOIT'] })
        .eq('user_id', userA.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });

    it('잘못된 age_range → 23514', async () => {
      const { error } = await admin
        .from('user_profiles')
        .update({ age_range: 'invalid' })
        .eq('user_id', userA.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });

    it('잘못된 budget_level → 23514', async () => {
      // userB에 journey가 T4에서 생성되었으므로 사용
      const { error } = await admin
        .from('journeys')
        .update({ budget_level: 'bogus' })
        .eq('user_id', userB.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });
  });

  // ── T7: journey M1 대칭 케이스 ────────────────────────────
  describe('T7: journey M1 대칭 (array union + aiWritable=false 무시)', () => {
    it('기존 skin_concerns에 AI 추가 + aiWritable=false 필드 무시', async () => {
      // Setup: userB는 T4에서 skin_concerns=['acne'] journey가 있음
      // Action: 추가 patch
      const { data, error } = await admin.rpc('apply_ai_journey_patch', {
        p_user_id: userB.userId,
        p_patch: {
          skin_concerns: ['dryness'],
          interest_activities: ['shopping'],  // aiWritable=false
          travel_style: ['efficient'],        // aiWritable=false
        },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual(['skin_concerns']);

      const { data: journey } = await admin
        .from('journeys')
        .select('skin_concerns, interest_activities, travel_style')
        .eq('user_id', userB.userId)
        .eq('status', 'active')
        .single();

      expect(journey!.skin_concerns).toEqual(['acne', 'dryness']);
      expect(journey!.interest_activities).toBeNull(); // 미변경
      expect(journey!.travel_style).toBeNull();        // 미변경
    });
  });

  // ── T8: scalar NULL → AI set (M3) ─────────────────────────
  describe('T8: scalar NULL → AI set (M3)', () => {
    it('age_range NULL → AI가 set 가능 → 이후 덮어쓰기 불가', async () => {
      // Setup: userC 프로필 생성 (age_range=NULL)
      await admin.from('user_profiles').upsert({
        user_id: userC.userId,
        language: 'en',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Action 1: AI가 age_range 설정
      const { data: d1, error: e1 } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userC.userId,
        p_patch: { age_range: '25-29' },
      });

      expect(e1).toBeNull();
      expect(d1 as string[]).toContain('age_range');

      const { data: row1 } = await admin
        .from('user_profiles')
        .select('age_range')
        .eq('user_id', userC.userId)
        .single();
      expect(row1!.age_range).toBe('25-29');

      // Action 2: AI가 다시 덮어쓰기 시도 → M1 보존
      const { data: d2, error: e2 } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userC.userId,
        p_patch: { age_range: '30-34' },
      });

      expect(e2).toBeNull();
      expect(d2 as string[]).not.toContain('age_range');

      const { data: row2 } = await admin
        .from('user_profiles')
        .select('age_range')
        .eq('user_id', userC.userId)
        .single();
      expect(row2!.age_range).toBe('25-29'); // 불변
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — red 확인**

```bash
npm run test:integration -- --testPathPattern=rpc-hardening
```

Expected: FAIL — 017이 아직 DB에 적용되지 않아 RPC가 3-arg 상태. `get_profile_field_spec` 함수 미존재 등의 에러.

- [ ] **Step 3: Commit (red tests)**

```bash
git add src/__tests__/integration/rpc-hardening.integration.test.ts
git commit -m "test(NEW-17e): RPC 하드닝 통합 테스트 T1~T8 추가 (red)

- T1: spec drift guard (get_*_field_spec ↔ TS 상수)
- T2: M1 사용자값 불변
- T3: skin_types cap 절단 금지
- T4: journey lazy-create (SG-3)
- T5: REVOKE 검증 4개 함수
- T6: CHECK 제약 방어 3건
- T7: journey M1 대칭 (array union + aiWritable=false)
- T8: scalar NULL → AI set → 덮어쓰기 불가 (M3)"
```

---

## Task 3: 사용자에게 017 Dashboard 수동 적용 요청

- [ ] **Step 1: 사용자에게 요청**

사용자에게 다음을 요청:
1. `supabase/migrations/017_rpc_hardening.sql` 전체 내용을 Supabase Dashboard SQL Editor에 붙여넣기
2. "Run" 클릭
3. 결과 확인 — 에러 없이 `COMMIT` 완료
4. 검증 쿼리 실행:
```sql
SELECT proname, pronargs FROM pg_proc
 WHERE proname IN ('apply_ai_profile_patch','apply_ai_journey_patch','get_profile_field_spec','get_journey_field_spec');
```
Expected: 4 rows, `apply_*` = pronargs 2, `get_*` = pronargs 0

- [ ] **Step 2: 통합 테스트 green 확인**

```bash
npm run test:integration -- --testPathPattern=rpc-hardening
```

Expected: T1~T8 전부 PASS

---

## Task 4: service.ts `p_spec` 인자 제거 (C1)

**Files:**
- Modify: `src/server/features/profile/service.ts:4-7,237-241,262-266`

- [ ] **Step 1: service.ts 수정**

3곳 변경:

**(a) import 제거 (line 4-7)**

기존:
```typescript
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from '@/shared/constants/profile-field-spec';
```
→ 삭제 (merge.ts와 integration test에서 직접 import하므로 service.ts 경유 불필요)

**(b) applyAiExtraction RPC 호출 (line 237-241)**

기존:
```typescript
  const { data, error } = await client.rpc('apply_ai_profile_patch', {
    p_user_id: userId,
    p_patch: patch,
    p_spec: PROFILE_FIELD_SPEC,
  });
```

변경:
```typescript
  const { data, error } = await client.rpc('apply_ai_profile_patch', {
    p_user_id: userId,
    p_patch: patch,
  });
```

**(c) applyAiExtractionToJourney RPC 호출 (line 262-266)**

기존:
```typescript
  const { data, error } = await client.rpc('apply_ai_journey_patch', {
    p_user_id: userId,
    p_patch: patch,
    p_spec: JOURNEY_FIELD_SPEC,
  });
```

변경:
```typescript
  const { data, error } = await client.rpc('apply_ai_journey_patch', {
    p_user_id: userId,
    p_patch: patch,
  });
```

- [ ] **Step 2: type-check 통과 확인**

```bash
npx tsc --noEmit
```

Expected: PASS (PROFILE_FIELD_SPEC/JOURNEY_FIELD_SPEC는 merge.ts에서 여전히 import → 미사용 아님)

---

## Task 5: service.test.ts M4 테스트 재정의 (C2)

**Files:**
- Modify: `src/server/features/profile/service.test.ts:1-5,286-382`

- [ ] **Step 1: import에서 FIELD_SPEC 제거**

기존 (line 2-5):
```typescript
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from '@/shared/constants/profile-field-spec';
```
→ 삭제 (더 이상 테스트에서 직접 참조하지 않음)

- [ ] **Step 2: applyAiExtraction 테스트 블록 재정의 (line 286-335)**

기존 4개 테스트 → 신규 4개 테스트로 교체:

```typescript
  describe('applyAiExtraction (RPC wrapper)', () => {
    it('정상: apply_ai_profile_patch 호출 + applied 반환', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: ['skin_types'], error: null });
      const client = { rpc: mockRpc };

      const { applyAiExtraction } = await import('@/server/features/profile/service');
      const r = await applyAiExtraction(client as never, 'user-1', {
        skin_types: ['dry'],
      });

      // C2: exact match — p_user_id + p_patch만. p_spec 키가 있으면 fail.
      expect(mockRpc).toHaveBeenCalledWith('apply_ai_profile_patch', {
        p_user_id: 'user-1',
        p_patch: { skin_types: ['dry'] },
      });
      expect(r.applied).toEqual(['skin_types']);
    });

    it('RPC 에러 → throw', async () => {
      const mockRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      await expect(
        applyAiExtraction(client as never, 'user-1', { skin_types: ['dry'] }),
      ).rejects.toThrow('AI profile patch failed');
    });

    it('RPC data=null → applied=[]', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      const r = await applyAiExtraction(client as never, 'user-1', { age_range: '25-29' });
      expect(r.applied).toEqual([]);
    });

    it('M4: RPC 호출은 정확히 2개 키만 전달 (p_spec 서버 고정 확인)', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtraction } = await import('@/server/features/profile/service');
      await applyAiExtraction(client as never, 'user-1', {});

      const args = mockRpc.mock.calls[0][1] as Record<string, unknown>;
      expect(Object.keys(args).sort()).toEqual(['p_patch', 'p_user_id']);
    });
  });
```

- [ ] **Step 3: applyAiExtractionToJourney 테스트 블록 재정의 (line 337-382)**

```typescript
  describe('applyAiExtractionToJourney (RPC wrapper)', () => {
    it('정상: apply_ai_journey_patch 호출', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: ['skin_concerns'], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      const r = await applyAiExtractionToJourney(client as never, 'user-1', {
        skin_concerns: ['acne'],
      });

      // C2: exact match — p_user_id + p_patch만
      expect(mockRpc).toHaveBeenCalledWith('apply_ai_journey_patch', {
        p_user_id: 'user-1',
        p_patch: { skin_concerns: ['acne'] },
      });
      expect(r.applied).toEqual(['skin_concerns']);
    });

    it('RPC 에러 → throw', async () => {
      const mockRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      await expect(
        applyAiExtractionToJourney(client as never, 'user-1', { skin_concerns: ['acne'] }),
      ).rejects.toThrow('AI journey patch failed');
    });

    it('M4: RPC 호출은 정확히 2개 키만 전달 (p_spec 서버 고정 확인)', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = { rpc: mockRpc };
      const { applyAiExtractionToJourney } = await import(
        '@/server/features/profile/service'
      );
      await applyAiExtractionToJourney(client as never, 'user-1', {});

      const args = mockRpc.mock.calls[0][1] as Record<string, unknown>;
      expect(Object.keys(args).sort()).toEqual(['p_patch', 'p_user_id']);
    });
  });
```

- [ ] **Step 4: unit test 실행**

```bash
npm test -- --run --testPathPattern=service.test
```

Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/features/profile/service.ts src/server/features/profile/service.test.ts
git commit -m "feat(NEW-17b): service.ts p_spec 인자 제거 + unit test exact match 재정의

- applyAiExtraction/applyAiExtractionToJourney: 3-arg → 2-arg (C1)
- PROFILE_FIELD_SPEC/JOURNEY_FIELD_SPEC import 제거 (G-4)
- M4 테스트: exact match assertion으로 재정의 (C2)"
```

---

## Task 6: 전수 검증

- [ ] **Step 1: type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: lint**

```bash
npm run lint
```

- [ ] **Step 3: build**

```bash
npm run build
```

- [ ] **Step 4: unit test 전체**

```bash
npm test -- --run
```

- [ ] **Step 5: integration test 전체**

```bash
npm run test:integration
```

Expected: 전부 PASS. 하나라도 실패 시 원인 분석 후 수정 → 재검증.

---

## Task 7: PR 생성

- [ ] **Step 1: push + PR 생성**

```bash
git push -u origin fix/new-17b-rpc-hardening-and-tests
```

PR body:

```markdown
## Summary
- RPC `p_spec` 인자 제거 → 서버 내부 `get_*_field_spec()` 함수로 고정 (보안 하드닝)
- `REVOKE authenticated` + `GRANT service_role` (4개 함수)
- CHECK 제약 3건 (`skin_types`, `age_range`, `budget_level`) — DB 레벨 허용값 강제
- 통합 테스트 T1~T8 추가

## NEW-17b Pre-merge Checklist
- [x] `npm run test:integration` 로컬 실행 통과 (T1~T8, 124/124)
- [x] `017_rpc_hardening.sql` Supabase Dashboard 적용 완료 (v1.2 FOUND fix 포함)
- [x] `SELECT proname, pronargs FROM pg_proc WHERE proname IN ('apply_ai_profile_patch','apply_ai_journey_patch')` 결과 2 rows 확인
- [x] 전수 검증 통과 (`type-check && lint && build && test && test:integration`)
- [x] CLAUDE.md Q-16 + V-27 drift 방어 규칙 추가

## Spec
`docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` v1.2

## Rollback
`supabase/migrations/017_rpc_hardening_rollback.sql` — 코드 revert와 동시 적용 필수
```
