# NEW-17 Profile Merge Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 추출이 사용자 명시값을 덮어쓰지 못하도록 merge 정책을 확립하고, `user_profiles.skin_type` 단일 컬럼을 `skin_types TEXT[]` (max 3) 배열로 전환한다.

**Architecture:** Postgres RPC `apply_ai_profile_patch` / `apply_ai_journey_patch`가 단일 SQL 트랜잭션에서 merge + 쓰기를 원자적으로 수행. TS 측 `merge.ts`는 RPC 의미론의 참조 구현으로 단위 테스트 용도. 쓰기 3경로(Start onboarding / PUT profile / chat afterWork) 모두 merge 규약 경유.

**Tech Stack:** Next.js 16 · TypeScript · Supabase (Postgres RPC) · Hono · Vitest · Tailwind · Zod

**Spec 정본:** `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` v1.1

**불변량:** M1(사용자값 불변), M2(배열 4중 cap: UI/zod/RPC/DB), M3(scalar AI는 null일 때만), M4(AI 실패 시 사용자 응답 무영향), M5(멱등), M6(onboarding 원샷 유지)

---

## File Structure

### 신규 파일
- `supabase/migrations/015_profile_skin_types_array.sql` — skin_types 컬럼 + 백필 + CHECK + `apply_ai_profile_patch` RPC
- `supabase/migrations/015b_apply_ai_journey_patch.sql` — journey RPC
- `supabase/migrations/016_drop_profile_skin_type.sql` — 구 컬럼 DROP (배포 후 별도 실행)
- `src/shared/constants/profile-field-spec.ts` — PROFILE_FIELD_SPEC / JOURNEY_FIELD_SPEC + MAX_SKIN_TYPES
- `src/server/features/profile/merge.ts` — `computeProfilePatch` + `mergeExtractionResults` (TS 참조 구현)
- `src/server/features/profile/merge.test.ts` — merge 규약 단위 테스트
- `src/__tests__/integration/rpc-merge-sync.integration.test.ts` — RPC ↔ TS 의미론 sync test

### 수정 파일
- `src/shared/types/profile.ts` — `UserProfileVars.skin_type` → `skin_types: SkinType[]`
- `src/shared/constants/beauty.ts` — `MAX_SKIN_TYPES` 파생 상수 추가
- `src/server/features/profile/service.ts` — `ProfileRow.skin_types`, `getProfile` 정규화, `applyAiExtraction` / `applyAiExtractionToJourney` wrapper, `ProfileData` 갱신
- `src/server/features/profile/service.test.ts` — 스키마 변경 반영
- `src/server/features/api/routes/profile.ts` — `startOnboardingBodySchema.skin_types`, `updateBodySchema.skin_types`, `persistOnboarding`
- `src/server/features/api/routes/profile.test.ts` — 페이로드 갱신 + 경계 테스트
- `src/server/features/api/routes/chat.ts` — afterWork: `mergeExtractionResults` + 2 RPC wrapper 호출
- `src/server/features/api/routes/chat.test.ts` — mock + 회귀
- `src/server/features/chat/tools/extraction-handler.ts` — `skin_types` 배열 + `learned_preferences` 제거
- `src/server/features/chat/tools/extraction-handler.test.ts` — 갱신
- `src/server/features/chat/tools/search-handler.ts` — wrapper 제거 + `resolveConflicts` 호출
- `src/server/features/chat/tools/search-handler.test.ts` — 갱신
- `src/server/features/chat/service.ts` — ctx `skin_types` 전달
- `src/server/features/chat/prompts.ts` — `skin_types.join(', ')` 렌더
- `src/server/features/chat/prompts.test.ts` — 갱신
- `src/server/features/beauty/derived.ts` — 배열 시그니처 + `resolveConflicts`
- `src/server/features/beauty/derived.test.ts` — 갱신 + conflict 3건
- `src/client/features/chat/OnboardingChips.tsx` — skin_types 다중 선택
- `src/client/features/chat/OnboardingChips.test.tsx` — 갱신
- `src/client/features/profile/ProfileCard.tsx` — 배열 렌더
- `src/__tests__/integration/profile-routes.integration.test.ts` — E2E 갱신
- `docs/03-design/schema.dbml`, `docs/03-design/PRD.md` §4-A UP-1
- `docs/05-design-detail/api-spec.md`, `tool-spec.md`, `system-prompt-spec.md`
- `TODO.md` — NEW-17 완료 표시

### 삭제 파일 (CQ-1, v0.2 wizard)
- `src/client/features/onboarding/OnboardingWizard.tsx`
- `src/client/features/onboarding/StepSkinHair.tsx`
- `src/client/features/onboarding/StepConcerns.tsx`
- `src/client/features/onboarding/StepInterests.tsx`
- `src/client/features/onboarding/StepTravel.tsx`
- `OnboardingFormData` 인터페이스 (`src/shared/types/profile.ts`)

---

## Task 1: shared/constants/profile-field-spec.ts 신규

**Files:**
- Create: `src/shared/constants/profile-field-spec.ts`
- Modify: `src/shared/constants/beauty.ts` (추가)
- Modify: `src/shared/constants/index.ts` (re-export)

- [ ] **Step 1: Create profile-field-spec.ts**

`src/shared/constants/profile-field-spec.ts`:
```ts
// ============================================================
// NEW-17: 프로필 필드 스펙 레지스트리 (정본)
// L-13: 순수 상수. L-16: types/ 만 참조.
// ============================================================

import type { UserProfileVars, JourneyContextVars } from "../types/profile";

export type ProfileFieldSpec =
  | { cardinality: "scalar"; aiWritable: boolean }
  | { cardinality: "array"; aiWritable: boolean; max: number };

export const PROFILE_FIELD_SPEC = {
  skin_types:    { cardinality: "array",  aiWritable: true,  max: 3 },
  hair_type:     { cardinality: "scalar", aiWritable: false },
  hair_concerns: { cardinality: "array",  aiWritable: false, max: 6 },
  country:       { cardinality: "scalar", aiWritable: false },
  language:      { cardinality: "scalar", aiWritable: false },
  age_range:     { cardinality: "scalar", aiWritable: true  },
} as const satisfies Record<keyof UserProfileVars, ProfileFieldSpec>;

export const JOURNEY_FIELD_SPEC = {
  skin_concerns:       { cardinality: "array",  aiWritable: true,  max: 5 },
  interest_activities: { cardinality: "array",  aiWritable: false, max: 5 },
  stay_days:           { cardinality: "scalar", aiWritable: true  },
  start_date:          { cardinality: "scalar", aiWritable: false },
  end_date:            { cardinality: "scalar", aiWritable: false },
  budget_level:        { cardinality: "scalar", aiWritable: true  },
  travel_style:        { cardinality: "array",  aiWritable: false, max: 7 },
} as const satisfies Record<keyof JourneyContextVars, ProfileFieldSpec>;

/** UP-1: 단일 사용자가 가질 수 있는 피부 타입 수 상한 (G-10 단일 원천) */
export const MAX_SKIN_TYPES = PROFILE_FIELD_SPEC.skin_types.max;
```

- [ ] **Step 2: Re-export from constants/index.ts**

Append to `src/shared/constants/index.ts`:
```ts
export * from "./profile-field-spec";
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants/profile-field-spec.ts src/shared/constants/index.ts
git commit -m "feat(NEW-17): 프로필 필드 스펙 레지스트리 + MAX_SKIN_TYPES"
```

---

## Task 2: shared/types/profile.ts — skin_types 배열화 + 레거시 타입 정리

**Files:**
- Modify: `src/shared/types/profile.ts`

- [ ] **Step 1: Update UserProfileVars interface**

Replace in `src/shared/types/profile.ts`:
```ts
/** UP: User Profile — 반영구적 (NEW-17: skin_type 단일 → skin_types 배열 max 3) */
export interface UserProfileVars {
  skin_types: SkinType[];               // UP-1 (NEW-17)
  hair_type: HairType | null;           // UP-2
  hair_concerns: HairConcern[];         // UP-2
  country: string | null;               // UP-3
  language: SupportedLanguage;          // UP-3
  age_range: AgeRange | null;           // UP-4
}
```

- [ ] **Step 2: Delete OnboardingFormData interface (CQ-1 v0.2 wizard 제거)**

Remove the entire `OnboardingFormData` interface block from `src/shared/types/profile.ts` (section at bottom that starts with `/** Onboarding form data (4 steps combined) */`).

- [ ] **Step 3: Run type check**

```bash
bun run type-check
```

Expected: errors in consumers (OnboardingChips, service.ts, prompts.ts, derived.ts, etc.). Do NOT fix yet — subsequent tasks will handle each file.

- [ ] **Step 4: Commit (with expected compile errors)**

Intentionally commit type-breaking change so subsequent tasks have a clear baseline:

```bash
git add src/shared/types/profile.ts
git commit -m "refactor(NEW-17): UserProfileVars.skin_type 단일 → skin_types 배열 + OnboardingFormData 제거"
```

---

## Task 3: v0.2 wizard 파일 삭제 (CQ-1)

**Files:**
- Delete: `src/client/features/onboarding/OnboardingWizard.tsx`
- Delete: `src/client/features/onboarding/StepSkinHair.tsx`
- Delete: `src/client/features/onboarding/StepConcerns.tsx`
- Delete: `src/client/features/onboarding/StepInterests.tsx`
- Delete: `src/client/features/onboarding/StepTravel.tsx`

- [ ] **Step 1: Verify files are truly unused in MVP**

```bash
rg "OnboardingWizard|StepSkinHair|StepConcerns|StepInterests|StepTravel" src/ --files-with-matches
```

Expected: only the files themselves + their own test files. No `app/` imports.

- [ ] **Step 2: Delete files**

```bash
rm src/client/features/onboarding/OnboardingWizard.tsx
rm src/client/features/onboarding/StepSkinHair.tsx
rm src/client/features/onboarding/StepConcerns.tsx
rm src/client/features/onboarding/StepInterests.tsx
rm src/client/features/onboarding/StepTravel.tsx
# Remove directory if empty
rmdir src/client/features/onboarding 2>/dev/null || true
```

- [ ] **Step 3: Verify build**

```bash
bun run type-check
```

Expected: no errors from the deletion (other NEW-17 errors remain).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(NEW-17/CQ-1): v0.2 풀 위저드 컴포넌트 삭제 — PRD §595 재설계로 낡음"
```

---

## Task 4: Migration 015 — skin_types 컬럼 + apply_ai_profile_patch RPC

**Files:**
- Create: `supabase/migrations/015_profile_skin_types_array.sql`

- [ ] **Step 1: Write migration 015**

`supabase/migrations/015_profile_skin_types_array.sql`:
```sql
-- ============================================================
-- NEW-17: user_profiles.skin_type 단일 → skin_types TEXT[] (max 3)
--         + AI patch RPC (사용자값 보존 원자 merge)
-- Spec: docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md
-- ============================================================

-- Step 1. 컬럼 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS skin_types text[] NULL;

COMMENT ON COLUMN user_profiles.skin_types IS
  'NEW-17: UP-1 다중값. 사용자 명시값 + AI 추출 합집합, max 3. products.skin_types 대칭.';

-- Step 2. 무손실 백필
UPDATE user_profiles
   SET skin_types = ARRAY[skin_type]
 WHERE skin_type IS NOT NULL AND skin_types IS NULL;

-- Step 3. CHECK — M2 DB 레벨 (3 = PROFILE_FIELD_SPEC.skin_types.max)
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_skin_types_max_3
  CHECK (skin_types IS NULL OR array_length(skin_types, 1) <= 3);

-- Step 4. AI patch RPC — M1/M2/M3/M5 DB 레벨 강제
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
      -- M3 + CR-2: 현 값 조회, NULL일 때만 set, 실제 변경 시에만 applied
      EXECUTE format(
        'SELECT %I::text FROM user_profiles WHERE user_id = $1',
        v_field
      ) INTO v_cur_scalar USING p_user_id;

      IF v_cur_scalar IS NULL THEN
        EXECUTE format(
          'UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2 AND %I IS NULL',
          v_field, v_field
        ) USING v_inc#>>'{}', p_user_id;
        IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
      END IF;
    ELSE
      -- CR-1: priority ordering으로 cur 우선 보존
      v_max := (v_fspec->>'max')::int;

      EXECUTE format(
        'SELECT COALESCE(%I, ARRAY[]::text[]) FROM user_profiles WHERE user_id = $1',
        v_field
      ) INTO v_cur_arr USING p_user_id;

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

      -- CR-2: IS DISTINCT FROM 가드
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

COMMENT ON FUNCTION apply_ai_profile_patch IS
  'NEW-17 v1.1: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. M1/M2/M3/M5 강제.';
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
bunx supabase migration up
```

Expected: migration 015 applied successfully, no errors.

- [ ] **Step 3: Smoke test — verify RPC exists**

```bash
bunx supabase db query "SELECT proname FROM pg_proc WHERE proname = 'apply_ai_profile_patch';"
```

Expected: one row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_profile_skin_types_array.sql
git commit -m "feat(NEW-17): migration 015 — user_profiles.skin_types 배열 + apply_ai_profile_patch RPC"
```

---

## Task 5: Migration 015b — apply_ai_journey_patch RPC

**Files:**
- Create: `supabase/migrations/015b_apply_ai_journey_patch.sql`

- [ ] **Step 1: Write migration 015b**

`supabase/migrations/015b_apply_ai_journey_patch.sql`:
```sql
-- ============================================================
-- NEW-17: journeys AI patch RPC. Chat-First 시나리오에서 journey lazy-create.
-- 구조는 015와 동일 의미론.
-- SG-3: INSERT 컬럼 목록에서 country/city 제외 → DEFAULT 'KR'/'seoul' 적용.
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
  SELECT id INTO v_journey_id FROM journeys
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO journeys (user_id, status)
    VALUES (p_user_id, 'active')
    ON CONFLICT DO NOTHING
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
          'UPDATE journeys SET %I = $1 WHERE id = $2 AND %I IS NULL',
          v_field, v_field
        ) USING v_inc#>>'{}', v_journey_id;
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
```

- [ ] **Step 2: Apply + verify**

```bash
bunx supabase migration up
bunx supabase db query "SELECT proname FROM pg_proc WHERE proname = 'apply_ai_journey_patch';"
```

Expected: 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015b_apply_ai_journey_patch.sql
git commit -m "feat(NEW-17): migration 015b — apply_ai_journey_patch RPC (lazy-create)"
```

---

## Task 6: Migration 016 — 구 컬럼 DROP (배포 후용)

**Files:**
- Create: `supabase/migrations/016_drop_profile_skin_type.sql`

- [ ] **Step 1: Write migration 016**

`supabase/migrations/016_drop_profile_skin_type.sql`:
```sql
-- ============================================================
-- NEW-17: 배포 시퀀스 4단계 — 구 skin_type 컬럼 DROP.
-- ⚠️ 이 migration은 코드 배포 완료 + 24~72h 관측 후 실행.
-- ============================================================

ALTER TABLE user_profiles DROP COLUMN IF EXISTS skin_type;
```

- [ ] **Step 2: Do NOT apply yet**

Commit only. Apply manually after production code deploy + observation window.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_drop_profile_skin_type.sql
git commit -m "feat(NEW-17): migration 016 — 구 skin_type DROP (배포 후 수동 적용)"
```

---

## Task 7: profile/merge.ts 참조 구현 + 단위 테스트 (TDD)

**Files:**
- Create: `src/server/features/profile/merge.ts`
- Test: `src/server/features/profile/merge.test.ts`

- [ ] **Step 1: Write failing test — scalar/user replace**

Create `src/server/features/profile/merge.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeProfilePatch, mergeExtractionResults } from "./merge";
import { PROFILE_FIELD_SPEC, JOURNEY_FIELD_SPEC } from "@/shared/constants/profile-field-spec";

describe("computeProfilePatch", () => {
  describe("scalar + source=user", () => {
    it("existing null → set", () => {
      const r = computeProfilePatch(
        { age_range: null },
        { age_range: "25-29" },
        "user",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({ age_range: "25-29" });
    });
    it("existing set → replace", () => {
      const r = computeProfilePatch(
        { age_range: "25-29" },
        { age_range: "30-34" },
        "user",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({ age_range: "30-34" });
    });
  });

  describe("scalar + source=ai", () => {
    it("aiWritable=false → skip", () => {
      const r = computeProfilePatch(
        { hair_type: null },
        { hair_type: "straight" },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
      expect(r.skipped).toContainEqual({ field: "hair_type", reason: "not_ai_writable" });
    });
    it("existing null → set", () => {
      const r = computeProfilePatch(
        { age_range: null },
        { age_range: "25-29" },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({ age_range: "25-29" });
    });
    it("existing set → skip (M1)", () => {
      const r = computeProfilePatch(
        { age_range: "25-29" },
        { age_range: "30-34" },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
      expect(r.skipped).toContainEqual({ field: "age_range", reason: "ai_scalar_nonempty" });
    });
  });

  describe("array + source=user", () => {
    it("replace (capped)", () => {
      const r = computeProfilePatch(
        { skin_types: ["oily"] },
        { skin_types: ["dry", "sensitive"] },
        "user",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({ skin_types: ["dry", "sensitive"] });
    });
    it("cap 초과 입력 → max 절단", () => {
      const r = computeProfilePatch(
        { skin_types: [] },
        { skin_types: ["dry", "oily", "sensitive", "normal"] },
        "user",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates.skin_types).toHaveLength(3);
    });
  });

  describe("array + source=ai — M1 사용자값 보존", () => {
    it("union under cap", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry"] },
        { skin_types: ["sensitive"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates.skin_types).toEqual(["dry", "sensitive"]);
    });
    it("cap 도달 → 사용자값 절대 보존, AI 추가 0", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry", "sensitive", "oily"] },
        { skin_types: ["combination"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      // cur 3개 전부 그대로, combination은 cap으로 절단
      expect(r.updates).toEqual({});
    });
    it("all duplicates → no_change skip", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry"] },
        { skin_types: ["dry"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
    });
    it("empty incoming → skip", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry"] },
        { skin_types: [] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
    });
    it("existing null + incoming ['dry'] → ['dry']", () => {
      const r = computeProfilePatch(
        { skin_types: [] },
        { skin_types: ["dry"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates.skin_types).toEqual(["dry"]);
    });
  });

  it("멱등 재호출", () => {
    const existing = { skin_types: ["dry", "sensitive"], age_range: "25-29" as const };
    const incoming = { skin_types: ["dry"], age_range: "30-34" as const };
    const r1 = computeProfilePatch(existing, incoming, "ai", PROFILE_FIELD_SPEC);
    expect(r1.updates).toEqual({});
  });
});

describe("mergeExtractionResults — 라우팅 + AI-AI union", () => {
  it("PROFILE_FIELD_SPEC ∩ JOURNEY_FIELD_SPEC = ∅ (라우팅 불변량)", () => {
    const p = new Set(Object.keys(PROFILE_FIELD_SPEC));
    for (const k of Object.keys(JOURNEY_FIELD_SPEC)) {
      expect(p.has(k)).toBe(false);
    }
  });

  it("scalar first-wins across extractions", () => {
    const r = mergeExtractionResults([
      { skin_types: null, skin_concerns: null, stay_days: null, budget_level: null, age_range: "25-29" },
      { skin_types: null, skin_concerns: null, stay_days: null, budget_level: null, age_range: "30-34" },
    ]);
    expect(r.profilePatch.age_range).toBe("25-29");
  });

  it("array union across extractions + profile/journey routing", () => {
    const r = mergeExtractionResults([
      { skin_types: ["dry"], skin_concerns: ["acne"], stay_days: null, budget_level: null, age_range: null },
      { skin_types: ["sensitive"], skin_concerns: ["pores"], stay_days: null, budget_level: null, age_range: null },
    ]);
    expect(r.profilePatch.skin_types).toEqual(["dry", "sensitive"]);
    expect(r.journeyPatch.skin_concerns).toEqual(["acne", "pores"]);
  });

  it("null skin_types 전파 skip", () => {
    const r = mergeExtractionResults([
      { skin_types: null, skin_concerns: null, stay_days: 5, budget_level: null, age_range: null },
    ]);
    expect(r.profilePatch).not.toHaveProperty("skin_types");
    expect(r.journeyPatch.stay_days).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
bun test src/server/features/profile/merge.test.ts
```

Expected: FAIL — `Cannot find module './merge'`.

- [ ] **Step 3: Implement merge.ts**

Create `src/server/features/profile/merge.ts`:
```ts
import "server-only";
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
  type ProfileFieldSpec,
} from "@/shared/constants/profile-field-spec";
import type { UserProfileVars, JourneyContextVars } from "@/shared/types/profile";

// ============================================================
// NEW-17: 프로필 merge 규약 TS 참조 구현.
// 프로덕션 경로는 Postgres RPC (apply_ai_profile_patch / apply_ai_journey_patch)
// 사용. 이 파일은 (a) 단위 테스트로 규약 고정, (b) RPC 의미론의 TS 정본.
// L-7: 순수 함수. DB/API 호출 없음.
// ============================================================

export type WriteSource = "user" | "ai";

export interface MergeResult<T> {
  updates: Partial<T>;
  skipped: Array<{
    field: string;
    reason:
      | "not_ai_writable"
      | "ai_scalar_nonempty"
      | "no_change"
      | "empty_incoming";
  }>;
}

export function computeProfilePatch<T extends Record<string, unknown>>(
  existing: Partial<T>,
  incoming: Partial<T>,
  source: WriteSource,
  spec: Record<string, ProfileFieldSpec>,
): MergeResult<T> {
  const updates: Partial<T> = {};
  const skipped: MergeResult<T>["skipped"] = [];

  for (const [field, fspec] of Object.entries(spec)) {
    if (!(field in incoming)) continue;
    const inc = incoming[field as keyof T];
    if (inc === undefined) continue;

    if (source === "ai" && !fspec.aiWritable) {
      skipped.push({ field, reason: "not_ai_writable" });
      continue;
    }

    if (fspec.cardinality === "scalar") {
      if (source === "ai") {
        const cur = existing[field as keyof T];
        if (cur !== null && cur !== undefined) {
          skipped.push({ field, reason: "ai_scalar_nonempty" });
          continue;
        }
        if (inc === null) {
          skipped.push({ field, reason: "empty_incoming" });
          continue;
        }
      }
      (updates as Record<string, unknown>)[field] = inc;
    } else {
      const incArr = (inc as unknown as string[] | null) ?? [];
      const curArr = ((existing[field as keyof T] as unknown) as string[] | null | undefined) ?? [];

      if (source === "user") {
        const capped = incArr.slice(0, fspec.max);
        // user 경로도 현 값과 동일하면 skip (의미 없는 쓰기 방지)
        if (
          curArr.length === capped.length &&
          curArr.every((x, i) => x === capped[i])
        ) {
          skipped.push({ field, reason: "no_change" });
          continue;
        }
        (updates as Record<string, unknown>)[field] = capped;
      } else {
        if (incArr.length === 0) {
          skipped.push({ field, reason: "empty_incoming" });
          continue;
        }
        const curSet = new Set(curArr);
        const additions = incArr.filter((x) => !curSet.has(x));
        if (additions.length === 0) {
          skipped.push({ field, reason: "no_change" });
          continue;
        }
        const remaining = Math.max(0, fspec.max - curArr.length);
        const trimmed = additions.slice(0, remaining);
        if (trimmed.length === 0) {
          skipped.push({ field, reason: "no_change" });
          continue;
        }
        (updates as Record<string, unknown>)[field] = [...curArr, ...trimmed];
      }
    }
  }

  return { updates, skipped };
}

// ────────────────────────────────────────────────────────────
// mergeExtractionResults — N개 추출을 1개 patch로 pre-merge (AI-AI)
// ────────────────────────────────────────────────────────────

type ExtractionResult = {
  skin_types: string[] | null;
  skin_concerns: string[] | null;
  stay_days: number | null;
  budget_level: string | null;
  age_range: string | null;
};

export function mergeExtractionResults(results: ExtractionResult[]): {
  profilePatch: Partial<UserProfileVars>;
  journeyPatch: Partial<JourneyContextVars>;
} {
  const profileScalarSeen = new Map<string, unknown>();
  const journeyScalarSeen = new Map<string, unknown>();
  const profileArrays = new Map<string, Set<string>>();
  const journeyArrays = new Map<string, Set<string>>();

  const profileKeys = new Set(Object.keys(PROFILE_FIELD_SPEC));
  const journeyKeys = new Set(Object.keys(JOURNEY_FIELD_SPEC));

  const routeScalar = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (profileKeys.has(key) && !profileScalarSeen.has(key)) {
      profileScalarSeen.set(key, value);
    } else if (journeyKeys.has(key) && !journeyScalarSeen.has(key)) {
      journeyScalarSeen.set(key, value);
    }
  };

  const routeArray = (key: string, value: string[] | null) => {
    if (!value || value.length === 0) return;
    const target = profileKeys.has(key)
      ? profileArrays
      : journeyKeys.has(key)
        ? journeyArrays
        : null;
    if (!target) return;
    const set = target.get(key) ?? new Set<string>();
    for (const v of value) set.add(v);
    target.set(key, set);
  };

  for (const r of results) {
    routeArray("skin_types", r.skin_types);
    routeArray("skin_concerns", r.skin_concerns);
    routeScalar("stay_days", r.stay_days);
    routeScalar("budget_level", r.budget_level);
    routeScalar("age_range", r.age_range);
  }

  const profilePatch: Partial<UserProfileVars> = {};
  const journeyPatch: Partial<JourneyContextVars> = {};

  for (const [k, v] of profileScalarSeen) (profilePatch as Record<string, unknown>)[k] = v;
  for (const [k, v] of journeyScalarSeen) (journeyPatch as Record<string, unknown>)[k] = v;
  for (const [k, set] of profileArrays) (profilePatch as Record<string, unknown>)[k] = [...set];
  for (const [k, set] of journeyArrays) (journeyPatch as Record<string, unknown>)[k] = [...set];

  return { profilePatch, journeyPatch };
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/server/features/profile/merge.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/profile/merge.ts src/server/features/profile/merge.test.ts
git commit -m "feat(NEW-17): merge.ts 참조 구현 + 18건 단위 테스트 (TDD)"
```

---

## Task 8: profile/service.ts — ProfileRow 갱신 + applyAi* wrapper

**Files:**
- Modify: `src/server/features/profile/service.ts`
- Modify: `src/server/features/profile/service.test.ts`

- [ ] **Step 1: Write failing test for applyAiExtraction wrapper**

Add to `src/server/features/profile/service.test.ts`:
```ts
describe("applyAiExtraction (RPC wrapper)", () => {
  it("정상: rpc 호출 + applied 반환", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: ["skin_types"], error: null });
    const client = { rpc: mockRpc };

    const { applyAiExtraction } = await import("@/server/features/profile/service");
    const r = await applyAiExtraction(client as never, "user-1", { skin_types: ["dry"] });

    expect(mockRpc).toHaveBeenCalledWith("apply_ai_profile_patch", {
      p_user_id: "user-1",
      p_patch: { skin_types: ["dry"] },
      p_spec: expect.any(Object),
    });
    expect(r.applied).toEqual(["skin_types"]);
  });

  it("RPC 에러 → throw", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    const client = { rpc: mockRpc };
    const { applyAiExtraction } = await import("@/server/features/profile/service");
    await expect(applyAiExtraction(client as never, "user-1", { skin_types: ["dry"] }))
      .rejects.toThrow("AI profile patch failed");
  });
});

describe("applyAiExtractionToJourney (RPC wrapper)", () => {
  it("정상: apply_ai_journey_patch 호출", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: ["skin_concerns"], error: null });
    const client = { rpc: mockRpc };
    const { applyAiExtractionToJourney } = await import("@/server/features/profile/service");
    const r = await applyAiExtractionToJourney(client as never, "user-1", { skin_concerns: ["acne"] });
    expect(mockRpc).toHaveBeenCalledWith("apply_ai_journey_patch", expect.any(Object));
    expect(r.applied).toEqual(["skin_concerns"]);
  });
});
```

Also update existing `upsertProfile` test to use `skin_types: ['oily']` (array) instead of `skin_type: 'oily'`.

- [ ] **Step 2: Run tests — expect fails**

```bash
bun test src/server/features/profile/service.test.ts
```

Expected: new tests fail ("applyAiExtraction is not a function"), upsertProfile tests fail (property mismatch).

- [ ] **Step 3: Update service.ts**

Edit `src/server/features/profile/service.ts`:

Replace `ProfileData` interface:
```ts
interface ProfileData {
  skin_types: string[];                 // NEW-17: 단일 → 배열
  hair_type: string | null;
  hair_concerns: string[];
  country: string | null;
  language: string;
  age_range?: string | null;
}
```

Replace `ProfileRow` interface:
```ts
interface ProfileRow {
  user_id: string;
  skin_types: string[] | null;          // NEW-17 (SG-6)
  hair_type: string | null;
  hair_concerns: string[] | null;
  country: string | null;
  language: string;
  age_range: string | null;
  beauty_summary: string | null;
  onboarding_completed_at: string | null;
  updated_at: string;
}
```

Replace `upsertProfile` body `skin_type: data.skin_type` → `skin_types: data.skin_types`.

Replace `getProfile` return to normalize:
```ts
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Profile retrieval failed");
  if (!data) return null;

  // CQ-2: SG-6 정합 — 배열 필드 [] 정규화 (null 대신 빈 배열)
  return {
    ...data,
    skin_types: data.skin_types ?? [],
    hair_concerns: data.hair_concerns ?? [],
  };
}
```

Add at bottom of file:
```ts
import type { UserProfileVars, JourneyContextVars } from "@/shared/types/profile";
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from "@/shared/constants/profile-field-spec";

/**
 * NEW-17: AI 추출 결과를 RPC `apply_ai_profile_patch`로 원자 적용.
 * M1 M2 M3 M5 DB 레벨 강제.
 */
export async function applyAiExtraction(
  client: SupabaseClient,
  userId: string,
  patch: Partial<UserProfileVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc("apply_ai_profile_patch", {
    p_user_id: userId,
    p_patch: patch,
    p_spec: PROFILE_FIELD_SPEC,
  });
  if (error) throw new Error("AI profile patch failed");
  return { applied: (data as string[]) ?? [] };
}

/**
 * NEW-17: journey AI 추출. journey 없으면 lazy-create.
 */
export async function applyAiExtractionToJourney(
  client: SupabaseClient,
  userId: string,
  patch: Partial<JourneyContextVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc("apply_ai_journey_patch", {
    p_user_id: userId,
    p_patch: patch,
    p_spec: JOURNEY_FIELD_SPEC,
  });
  if (error) throw new Error("AI journey patch failed");
  return { applied: (data as string[]) ?? [] };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test src/server/features/profile/service.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/profile/service.ts src/server/features/profile/service.test.ts
git commit -m "feat(NEW-17): profile service — skin_types 배열 + applyAi* RPC wrapper"
```

---

## Task 9: RPC ↔ TS 의미론 sync integration test

**Files:**
- Create: `src/__tests__/integration/rpc-merge-sync.integration.test.ts`

- [ ] **Step 1: Write sync test**

`src/__tests__/integration/rpc-merge-sync.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/server/core/db";
import { computeProfilePatch } from "@/server/features/profile/merge";
import { PROFILE_FIELD_SPEC } from "@/shared/constants/profile-field-spec";

// ============================================================
// NEW-17: RPC 의미론 ↔ TS 참조 구현 동일성 검증.
// 동일 (existing, incoming, source=ai) 입력에 대해 RPC와 merge.ts의
// 결과 상태가 정확히 일치해야 한다. 스펙 드리프트 방지.
// ============================================================

const CASES: Array<{
  name: string;
  existing: { skin_types: string[] | null; age_range: string | null };
  incoming: { skin_types?: string[] | null; age_range?: string | null };
}> = [
  { name: "empty → fill scalar", existing: { skin_types: null, age_range: null }, incoming: { age_range: "25-29" } },
  { name: "scalar M1 skip", existing: { skin_types: null, age_range: "25-29" }, incoming: { age_range: "30-34" } },
  { name: "array union under cap", existing: { skin_types: ["dry"], age_range: null }, incoming: { skin_types: ["sensitive"] } },
  { name: "array cap reached — no_change", existing: { skin_types: ["dry", "sensitive", "oily"], age_range: null }, incoming: { skin_types: ["combination"] } },
  { name: "array duplicates", existing: { skin_types: ["dry"], age_range: null }, incoming: { skin_types: ["dry"] } },
  { name: "array existing null + incoming", existing: { skin_types: null, age_range: null }, incoming: { skin_types: ["dry", "sensitive"] } },
  { name: "incoming null skip", existing: { skin_types: ["dry"], age_range: null }, incoming: { skin_types: null } },
  { name: "cap partial additions", existing: { skin_types: ["dry", "sensitive"], age_range: null }, incoming: { skin_types: ["oily", "combination"] } },
];

describe("RPC ↔ TS merge sync", () => {
  const client = createServiceClient();
  let testUserId: string;

  beforeEach(async () => {
    // unique user per test to avoid cross-test pollution
    testUserId = crypto.randomUUID();
    await client.from("user_profiles").insert({ user_id: testUserId, language: "en" });
  });

  for (const tc of CASES) {
    it(`sync: ${tc.name}`, async () => {
      // Set existing state
      await client
        .from("user_profiles")
        .update({ skin_types: tc.existing.skin_types, age_range: tc.existing.age_range })
        .eq("user_id", testUserId);

      // Apply via RPC
      await client.rpc("apply_ai_profile_patch", {
        p_user_id: testUserId,
        p_patch: tc.incoming,
        p_spec: PROFILE_FIELD_SPEC,
      });

      const { data: rpcResult } = await client
        .from("user_profiles")
        .select("skin_types, age_range")
        .eq("user_id", testUserId)
        .single();

      // Apply via TS
      const tsResult = computeProfilePatch(tc.existing, tc.incoming, "ai", PROFILE_FIELD_SPEC);
      const tsFinal = {
        skin_types: (tsResult.updates.skin_types as string[] | undefined) ?? tc.existing.skin_types ?? [],
        age_range: (tsResult.updates.age_range as string | null | undefined) ?? tc.existing.age_range ?? null,
      };
      const rpcFinal = {
        skin_types: rpcResult?.skin_types ?? [],
        age_range: rpcResult?.age_range ?? null,
      };

      expect(rpcFinal).toEqual(tsFinal);
    });
  }

  afterEach(async () => {
    await client.from("user_profiles").delete().eq("user_id", testUserId);
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
bun test src/__tests__/integration/rpc-merge-sync.integration.test.ts
```

Expected: all 8 sync cases PASS. If any fails, RPC SQL or merge.ts has drift.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/integration/rpc-merge-sync.integration.test.ts
git commit -m "test(NEW-17): RPC ↔ TS merge 의미론 sync integration test (8건)"
```

---

## Task 10: routes/profile.ts — zod 스키마 갱신 + persistOnboarding

**Files:**
- Modify: `src/server/features/api/routes/profile.ts`
- Modify: `src/server/features/api/routes/profile.test.ts`

- [ ] **Step 1: Write failing test — startOnboardingBody skin_types 배열**

Update `profile.test.ts` Start 경로 테스트:
```ts
it("POST /api/profile/onboarding Start — skin_types 배열 [dry,sensitive] 성공", async () => {
  const res = await app.request("/api/profile/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skin_types: ["dry", "sensitive"],
      skin_concerns: ["acne"],
      interest_activities: ["shopping"],
    }),
  });
  expect(res.status).toBe(201);
  expect(mockUpsertProfile).toHaveBeenCalledWith(
    expect.anything(),
    "user-123",
    expect.objectContaining({ skin_types: ["dry", "sensitive"] }),
  );
});

it("POST Start — skin_types=[] (min 1 위반) → 400", async () => {
  const res = await app.request("/api/profile/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skin_types: [], skin_concerns: [] }),
  });
  expect(res.status).toBe(400);
});

it("POST Start — skin_types 4개 (max 3 위반) → 400", async () => {
  const res = await app.request("/api/profile/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skin_types: ["dry", "oily", "sensitive", "normal"],
      skin_concerns: [],
    }),
  });
  expect(res.status).toBe(400);
});

it("PUT /api/profile — skin_types=['dry'] 성공", async () => {
  const res = await app.request("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skin_types: ["dry"] }),
  });
  expect(res.status).toBe(200);
  expect(mockUpdateProfile).toHaveBeenCalledWith(
    expect.anything(),
    "user-123",
    expect.objectContaining({ skin_types: ["dry"] }),
  );
});

it("PUT — skin_types=[] → 400 (min 1)", async () => {
  const res = await app.request("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skin_types: [] }),
  });
  expect(res.status).toBe(400);
});
```

Remove any existing test referring to `skin_type:` scalar field on Start/PUT paths — update to `skin_types` arrays.

- [ ] **Step 2: Run tests — expect fail**

```bash
bun test src/server/features/api/routes/profile.test.ts
```

Expected: new tests fail, existing `skin_type: "dry"` tests fail.

- [ ] **Step 3: Update profile.ts zod schemas**

Edit `src/server/features/api/routes/profile.ts`:

Add import:
```ts
import { PROFILE_FIELD_SPEC, MAX_SKIN_TYPES } from "@/shared/constants/profile-field-spec";
```

Replace `startOnboardingBodySchema` (keep structure, change skin_type line):
```ts
const startOnboardingBodySchema = z
  .object({
    skin_types: z.array(skinTypeEnum).min(1).max(MAX_SKIN_TYPES),
    hair_type: hairTypeEnum.nullable().optional(),
    hair_concerns: z.array(hairConcernEnum).default([]),
    country: z.string().min(2).max(2).optional(),
    language: languageEnum.default("en"),
    age_range: ageRangeEnum.optional(),
    skin_concerns: z.array(skinConcernEnum).max(5).default([]),
    interest_activities: z.array(interestActivityEnum).default(["shopping"]),
    stay_days: z.number().int().positive().optional(),
    start_date: z.string().date().optional(),
    budget_level: budgetLevelEnum.optional(),
    travel_style: z.array(travelStyleEnum).default([]),
  })
  .strict();
```

Replace `updateBodySchema` (SG-4):
```ts
const updateBodySchema = z
  .object({
    skin_types: z.array(skinTypeEnum).min(1).max(MAX_SKIN_TYPES).optional(),
    hair_type: z
      .enum(["straight", "wavy", "curly", "coily"])
      .nullable()
      .optional(),
    hair_concerns: z
      .array(
        z.enum([
          "damage",
          "thinning",
          "oily_scalp",
          "dryness",
          "dandruff",
          "color_treated",
        ]),
      )
      .optional(),
    country: z.string().min(2).max(2).optional(),
    language: z.enum(["en", "ja", "zh", "es", "fr", "ko"]).optional(),
    age_range: z
      .enum(["18-24", "25-29", "30-34", "35-39", "40-49", "50+"])
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });
```

Update `persistOnboarding` Start path:
```ts
await upsertProfile(client, userId, {
  skin_types: startBody.skin_types,              // NEW-17
  hair_type: startBody.hair_type ?? null,
  hair_concerns: startBody.hair_concerns,
  country: startBody.country ?? null,
  language: startBody.language,
  age_range: startBody.age_range ?? null,
});
```

- [ ] **Step 4: Run tests**

```bash
bun test src/server/features/api/routes/profile.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/api/routes/profile.ts src/server/features/api/routes/profile.test.ts
git commit -m "feat(NEW-17): profile routes — skin_types 배열 zod + PUT 스키마 (SG-4)"
```

---

## Task 11: routes/chat.ts — afterWork 리팩토링 (pre-merge + applyAi*)

**Files:**
- Modify: `src/server/features/api/routes/chat.ts`
- Modify: `src/server/features/api/routes/chat.test.ts`

- [ ] **Step 1: Write failing test — afterWork calls applyAiExtraction**

Update chat.test.ts (relevant mock + assertion):
```ts
const mockApplyAi = vi.fn().mockResolvedValue({ applied: ["skin_types"] });
const mockApplyAiJourney = vi.fn().mockResolvedValue({ applied: [] });
vi.mock("@/server/features/profile/service", () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  createMinimalProfile: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  applyAiExtraction: (...args: unknown[]) => mockApplyAi(...args),
  applyAiExtractionToJourney: (...args: unknown[]) => mockApplyAiJourney(...args),
}));

it("afterWork: extractionResults → mergeExtractionResults → applyAi*", async () => {
  // Setup: stream returns extractionResults with skin_types
  const result = makeStreamResult({
    extractionResults: [
      { skin_types: ["dry"], skin_concerns: null, stay_days: null, budget_level: null, age_range: null },
      { skin_types: ["sensitive"], skin_concerns: ["acne"], stay_days: null, budget_level: null, age_range: null },
    ],
  });
  // ... drive handler to completion ...
  await capturedStreamOpts?.onFinish?.({ messages: [] } as never);

  expect(mockApplyAi).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ skin_types: ["dry", "sensitive"] }),
  );
  expect(mockApplyAiJourney).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ skin_concerns: ["acne"] }),
  );
});
```

- [ ] **Step 2: Run test — fail**

```bash
bun test src/server/features/api/routes/chat.test.ts
```

- [ ] **Step 3: Update chat.ts afterWork**

In `src/server/features/api/routes/chat.ts`:

Add imports:
```ts
import {
  createMinimalProfile,
  applyAiExtraction,
  applyAiExtractionToJourney,
} from "@/server/features/profile/service";
import { mergeExtractionResults } from "@/server/features/profile/merge";
```

Remove `updateProfile` import if no longer used.

Replace the `if (result.extractionResults.length > 0) { ... }` block inside onFinish:
```ts
// step 11: 추출 결과 저장 (NEW-17 — 원자 merge)
if (result.extractionResults.length > 0) {
  // 프로필 미존재 시 최소 프로필 생성 (Chat-First)
  if (!profile) {
    try {
      await createMinimalProfile(serviceClient, user.id, parsed.data.locale);
    } catch {
      // PK 충돌 = 이미 존재 → 계속
    }
  }

  // 다중 extraction pre-merge (AI-AI union, scalar first-wins)
  const { profilePatch, journeyPatch } = mergeExtractionResults(result.extractionResults);

  if (Object.keys(profilePatch).length > 0) {
    await applyAiExtraction(serviceClient, user.id, profilePatch);
  }
  if (Object.keys(journeyPatch).length > 0) {
    await applyAiExtractionToJourney(serviceClient, user.id, journeyPatch);
  }
}
```

- [ ] **Step 4: Run test — pass**

```bash
bun test src/server/features/api/routes/chat.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/features/api/routes/chat.ts src/server/features/api/routes/chat.test.ts
git commit -m "feat(NEW-17): chat afterWork — mergeExtractionResults + applyAi* RPC"
```

---

## Task 12: extraction-handler — skin_types 배열 + learned_preferences 제거

**Files:**
- Modify: `src/server/features/chat/tools/extraction-handler.ts`
- Modify: `src/server/features/chat/tools/extraction-handler.test.ts`

- [ ] **Step 1: Update failing test**

Replace existing extraction-handler.test.ts cases to use `skin_types: ['oily']` (array) and verify `learned_preferences` is no longer in schema.

```ts
it("valid 배열 — skin_types multi-value", async () => {
  const result = await executeExtractUserProfile({
    skin_types: ["dry", "sensitive"],
    skin_concerns: null,
    stay_days: null,
    budget_level: null,
    age_range: null,
  });
  expect(result).toMatchObject({ skin_types: ["dry", "sensitive"] });
});

it("schema 에 learned_preferences 없음", () => {
  const shape = extractUserProfileSchema.shape;
  expect("learned_preferences" in shape).toBe(false);
});
```

Remove any test cases that reference `skin_type:` scalar or `learned_preferences`.

- [ ] **Step 2: Run tests — fail**

```bash
bun test src/server/features/chat/tools/extraction-handler.test.ts
```

- [ ] **Step 3: Update extraction-handler.ts**

Replace schema in `src/server/features/chat/tools/extraction-handler.ts`:
```ts
export const extractUserProfileSchema = z.object({
  skin_types: z.array(
    z.enum(["dry", "oily", "combination", "sensitive", "normal"]),
  ).nullable()
    .describe("Skin types if mentioned. Can be multiple (e.g., combination+sensitive). null if not mentioned."),

  skin_concerns: z.array(
    z.enum([
      "acne", "wrinkles", "dark_spots", "redness", "dryness",
      "pores", "dullness", "dark_circles", "uneven_tone", "sun_damage", "eczema",
    ]),
  ).nullable()
    .describe("Skin concerns if mentioned. null if not mentioned."),

  stay_days: z.number().nullable()
    .describe("Number of days staying in Korea. null if not."),

  budget_level: z.enum(["budget", "moderate", "premium", "luxury"]).nullable()
    .describe("Budget level. null if not mentioned."),

  age_range: z.enum(["18-24", "25-29", "30-34", "35-39", "40-49", "50+"]).nullable()
    .describe("Age range if mentioned or clearly inferable. null if not."),

  // NEW-17: learned_preferences 제거 (NEW-17c로 분리)
});

export type ExtractionResult = z.infer<typeof extractUserProfileSchema>;
```

- [ ] **Step 4: Run tests — pass**

```bash
bun test src/server/features/chat/tools/extraction-handler.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/features/chat/tools/extraction-handler.ts src/server/features/chat/tools/extraction-handler.test.ts
git commit -m "feat(NEW-17): extract_user_profile — skin_types 배열 + learned_preferences 제거"
```

---

## Task 13: chat/service.ts — ctx skin_types 전달

**Files:**
- Modify: `src/server/features/chat/service.ts`

- [ ] **Step 1: Locate + update line 79 region**

Find the block that builds ctx/profile for prompts and extraction (around line 79 based on grep). Change `skin_type: profile.skin_type` → `skin_types: profile.skin_types` (array). Check usage downstream.

```ts
// Before:
// skin_type: profile.skin_type,
// After:
skin_types: profile.skin_types ?? [],
```

- [ ] **Step 2: Run type-check**

```bash
bun run type-check
```

Expected: chat/service.ts compiles. Consumers that need update (prompts.ts, derived.ts) addressed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add src/server/features/chat/service.ts
git commit -m "refactor(NEW-17): chat/service ctx — skin_types 배열 전달"
```

---

## Task 14: beauty/derived.ts — skinTypes 배열 시그니처 + resolveConflicts

**Files:**
- Modify: `src/server/features/beauty/derived.ts`
- Modify: `src/server/features/beauty/derived.test.ts`

- [ ] **Step 1: Write failing test — 복수 skin_types + resolveConflicts**

Update `derived.test.ts`:
```ts
it("복수 skinTypes union → preferred 합집합", () => {
  const r = calculatePreferredIngredients(
    ["dry", "sensitive"],
    [],
    [],
  );
  expect(r).toContain("hyaluronic_acid"); // from dry
  expect(r).toContain("centella_asiatica"); // from sensitive
});

it("복수 skinTypes → avoided 합집합", () => {
  const r = calculateAvoidedIngredients(["sensitive", "dry"], []);
  expect(r).toContain("alcohol"); // from sensitive + dry
  expect(r).toContain("essential_oil"); // from sensitive
});

it("빈 배열 → learned만", () => {
  const r = calculatePreferredIngredients([], [], [
    { id: "1", category: "ingredient", preference: "tea_tree", direction: "like", confidence: 1, source: null },
  ]);
  expect(r).toEqual(["tea_tree"]);
});

describe("resolveConflicts (2A: avoided 우선)", () => {
  it("충돌 없음 → passthrough", () => {
    const r = resolveConflicts(["a", "b"], ["c"]);
    expect(r.preferred).toEqual(["a", "b"]);
    expect(r.avoided).toEqual(["c"]);
  });
  it("충돌 발생 → preferred에서 제거, avoided 유지", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = resolveConflicts(["a", "b", "c"], ["b"]);
    expect(r.preferred).toEqual(["a", "c"]);
    expect(r.avoided).toEqual(["b"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("완전 상쇄 (preferred ⊆ avoided)", () => {
    const r = resolveConflicts(["a"], ["a", "b"]);
    expect(r.preferred).toEqual([]);
    expect(r.avoided).toEqual(["a", "b"]);
  });
});
```

Update existing tests that pass `skinType: SkinType | null` (scalar) to pass `skinTypes: SkinType[]` (array).

- [ ] **Step 2: Run — fail**

```bash
bun test src/server/features/beauty/derived.test.ts
```

- [ ] **Step 3: Update derived.ts**

Edit `src/server/features/beauty/derived.ts`:
```ts
export function calculatePreferredIngredients(
  skinTypes: SkinType[],              // NEW-17: 단일 → 배열
  concerns: SkinConcern[],
  learnedLikes: LearnedPreference[],
): string[] {
  const ingredients = new Set<string>();
  for (const t of skinTypes) {
    for (const ing of SKIN_TYPE_PREFERRED[t] ?? []) ingredients.add(ing);
  }
  for (const c of concerns) {
    for (const ing of CONCERN_PREFERRED[c] ?? []) ingredients.add(ing);
  }
  for (const pref of learnedLikes) {
    if (pref.category === "ingredient" && pref.direction === "like") {
      ingredients.add(pref.preference);
    }
  }
  return [...ingredients];
}

export function calculateAvoidedIngredients(
  skinTypes: SkinType[],              // NEW-17: 단일 → 배열
  learnedDislikes: LearnedPreference[],
): string[] {
  const ingredients = new Set<string>();
  for (const t of skinTypes) {
    for (const ing of SKIN_TYPE_CAUTION[t] ?? []) ingredients.add(ing);
  }
  for (const pref of learnedDislikes) {
    if (pref.category === "ingredient" && pref.direction === "dislike") {
      ingredients.add(pref.preference);
    }
  }
  return [...ingredients];
}

/**
 * NEW-17 (2A): 복수 skin_types 확장 시 preferred ∩ avoided 충돌 해결.
 * 정책: avoided 우선 (민감 피부 안전 우선). preferred에서 제거 + 관측 로그.
 */
export function resolveConflicts(
  preferred: string[],
  avoided: string[],
): { preferred: string[]; avoided: string[] } {
  const avoidedSet = new Set(avoided);
  const conflicts = preferred.filter((p) => avoidedSet.has(p));
  if (conflicts.length > 0) {
    console.warn("[derived] ingredient conflict — avoided wins", { conflicts });
  }
  return {
    preferred: preferred.filter((p) => !avoidedSet.has(p)),
    avoided,
  };
}
```

- [ ] **Step 4: Run — pass**

```bash
bun test src/server/features/beauty/derived.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/features/beauty/derived.ts src/server/features/beauty/derived.test.ts
git commit -m "feat(NEW-17): derived — skinTypes 배열 + resolveConflicts(avoided 우선)"
```

---

## Task 15: chat/tools/search-handler.ts — wrapper 제거 + resolveConflicts 호출

**Files:**
- Modify: `src/server/features/chat/tools/search-handler.ts`
- Modify: `src/server/features/chat/tools/search-handler.test.ts`

- [ ] **Step 1: Update search-handler.ts**

Edit `searchShopping` function.

Replace:
```ts
skin_types: filters?.skin_types ?? (profile?.skin_type ? [profile.skin_type] : undefined),
```
with:
```ts
skin_types: filters?.skin_types ?? (profile?.skin_types?.length ? profile.skin_types : undefined),
```

Replace the `calculatePreferredIngredients` / `calculateAvoidedIngredients` calls to pass arrays + wrap with `resolveConflicts`:
```ts
import { resolveConflicts } from "@/server/features/beauty/derived";

// ...

const preferredRaw = calculatePreferredIngredients(
  profile?.skin_types ?? [],
  filters?.concerns ?? [],
  preferences.filter((p) => p.direction === "like"),
);
const avoidedRaw = calculateAvoidedIngredients(
  profile?.skin_types ?? [],
  preferences.filter((p) => p.direction === "dislike"),
);
const { preferred, avoided } = resolveConflicts(preferredRaw, avoidedRaw);
const scored = scoreProducts(products, preferred, avoided);
```

- [ ] **Step 2: Update search-handler.test.ts**

Replace mock profile `skin_type: 'dry'` with `skin_types: ['dry']`. Other assertions stay valid because downstream consumes array.

- [ ] **Step 3: Run**

```bash
bun test src/server/features/chat/tools/search-handler.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/features/chat/tools/search-handler.ts src/server/features/chat/tools/search-handler.test.ts
git commit -m "feat(NEW-17): search-handler — skin_types 직접 전달 + resolveConflicts"
```

---

## Task 16: chat/prompts.ts — User Profile 섹션 skin_types 렌더

**Files:**
- Modify: `src/server/features/chat/prompts.ts`
- Modify: `src/server/features/chat/prompts.test.ts`

- [ ] **Step 1: Update prompts.test.ts**

Replace mock `skin_type: 'oily'` with `skin_types: ['oily']`. Add assertion:
```ts
it("복수 skin_types 렌더: 'oily, sensitive'", () => {
  const prompt = buildSystemPrompt({
    profile: { ...mockProfile, skin_types: ["oily", "sensitive"] },
    // ...
  });
  expect(prompt).toContain("Skin type: oily, sensitive");
});
```

- [ ] **Step 2: Run — fail**

```bash
bun test src/server/features/chat/prompts.test.ts
```

- [ ] **Step 3: Update prompts.ts**

Replace at line ~331:
```ts
const skinType = profile.skin_types?.length
  ? profile.skin_types.join(", ")
  : "not specified";
```

- [ ] **Step 4: Run — pass**

```bash
bun test src/server/features/chat/prompts.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/features/chat/prompts.ts src/server/features/chat/prompts.test.ts
git commit -m "feat(NEW-17): prompts — skin_types 복수 렌더"
```

---

## Task 17: client OnboardingChips — skin_types 다중 선택

**Files:**
- Modify: `src/client/features/chat/OnboardingChips.tsx`
- Modify: `src/client/features/chat/OnboardingChips.test.tsx`

- [ ] **Step 1: Write failing test — 다중 선택**

Update tests:
```ts
it("skin_types 다중 선택 후 Start — payload skin_types=['dry','sensitive']", async () => {
  const user = userEvent.setup();
  render(<OnboardingChips onComplete={onComplete} />);

  await user.click(screen.getByRole("button", { name: /dry/i }));
  await user.click(screen.getByRole("button", { name: /sensitive/i }));
  await user.click(screen.getByRole("button", { name: /start/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/onboarding",
      expect.objectContaining({
        body: JSON.stringify({
          skin_types: ["dry", "sensitive"],
          skin_concerns: [],
        }),
      }),
    );
  });
});

it("skin_types 미선택 시 Start 비활성화", () => {
  render(<OnboardingChips onComplete={onComplete} />);
  expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
});

it("4번째 skin_type 클릭 시 max 초과 차단 (OptionGroup max)", async () => {
  // Simulate clicking 4 distinct skin type chips; only first 3 register
  const user = userEvent.setup();
  render(<OnboardingChips onComplete={onComplete} />);
  await user.click(screen.getByRole("button", { name: /dry/i }));
  await user.click(screen.getByRole("button", { name: /oily/i }));
  await user.click(screen.getByRole("button", { name: /sensitive/i }));
  await user.click(screen.getByRole("button", { name: /normal/i }));
  // After submit, only 3 in payload
  await user.click(screen.getByRole("button", { name: /start/i }));
  await waitFor(() => {
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.skin_types).toHaveLength(3);
  });
});
```

Remove any test asserting single `skin_type` scalar.

- [ ] **Step 2: Run — fail**

```bash
bun test src/client/features/chat/OnboardingChips.test.tsx
```

- [ ] **Step 3: Update OnboardingChips.tsx**

Replace relevant sections:

```tsx
import { PROFILE_FIELD_SPEC } from "@/shared/constants/profile-field-spec";

type StartPayload = {
  skipped?: false;
  skin_types: SkinType[];                // ← SkinType → SkinType[]
  skin_concerns: SkinConcern[];
};

export default function OnboardingChips({ onComplete }: OnboardingChipsProps) {
  const tChat = useTranslations("chat");
  const tOnb = useTranslations("onboarding");

  const [skinTypes, setSkinTypes] = useState<SkinType[]>([]);   // ← 배열
  const [concerns, setConcerns] = useState<SkinConcern[]>([]);
  const [submitMode, setSubmitMode] = useState<"idle" | "start" | "skip">("idle");
  const [hasError, setHasError] = useState(false);

  const isSubmitting = submitMode !== "idle";

  const skinOptions = SKIN_TYPES.map((v) => ({
    value: v,
    label: tOnb(`skinType_${v}`),
  }));
  const concernOptions = ONBOARDING_SKIN_CONCERNS.map((v) => ({
    value: v,
    label: tOnb(`skinConcern_${v}`),
  }));

  async function handleStart() {
    if (skinTypes.length === 0 || isSubmitting) return;
    setSubmitMode("start");
    setHasError(false);
    try {
      const ok = await submitOnboarding({
        skin_types: skinTypes,
        skin_concerns: concerns,
      });
      if (ok) onComplete();
      else { setHasError(true); setSubmitMode("idle"); }
    } catch (error) {
      console.error("[OnboardingChips] start failed", error);
      setHasError(true);
      setSubmitMode("idle");
    }
  }

  // ... handleSkip unchanged ...

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      {/* greeting unchanged */}

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {tOnb("skinType")}{" "}
          <span className="text-muted-foreground/70">
            ({skinTypes.length}/{PROFILE_FIELD_SPEC.skin_types.max})
          </span>
        </p>
        <OptionGroup
          options={skinOptions}
          value={skinTypes}
          onChange={(v) => setSkinTypes(v as SkinType[])}
          mode="multiple"                    // ← single → multiple
          max={PROFILE_FIELD_SPEC.skin_types.max}
        />
      </div>

      {/* concerns section unchanged */}

      {hasError && (
        <p className="text-xs text-destructive" role="alert">
          {tChat("onboarding.error")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="cta"
          onClick={handleStart}
          disabled={skinTypes.length === 0 || isSubmitting}
        >
          {submitMode === "start" ? tChat("onboarding.saving") : tChat("onboarding.start")}
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitMode === "skip" ? tChat("onboarding.saving") : tChat("onboarding.skip")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — pass**

```bash
bun test src/client/features/chat/OnboardingChips.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/client/features/chat/OnboardingChips.tsx src/client/features/chat/OnboardingChips.test.tsx
git commit -m "feat(NEW-17): OnboardingChips — skin_types 다중 선택 (max 3)"
```

---

## Task 18: ProfileCard.tsx — 배열 렌더

**Files:**
- Modify: `src/client/features/profile/ProfileCard.tsx`

- [ ] **Step 1: Update skin_type rendering**

Find any `profile.skin_type` usage in `ProfileCard.tsx` and replace with array rendering:
```tsx
{profile.skin_types?.length ? (
  <span>{profile.skin_types.map((t) => tOnb(`skinType_${t}`)).join(", ")}</span>
) : (
  <span className="text-muted-foreground">—</span>
)}
```

- [ ] **Step 2: Type-check**

```bash
bun run type-check
```

Expected: no errors in ProfileCard.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/client/features/profile/ProfileCard.tsx
git commit -m "refactor(NEW-17): ProfileCard — skin_types 배열 렌더"
```

---

## Task 19: 통합 테스트 — profile-routes E2E 갱신

**Files:**
- Modify: `src/__tests__/integration/profile-routes.integration.test.ts`

- [ ] **Step 1: Update existing tests to use skin_types arrays**

Rename `skin_type` → `skin_types` in payloads. Add new test:

```ts
it("Start + post-onboarding AI extraction → 합집합", async () => {
  // 1. Start onboarding with skin_types=['dry']
  await startOnboarding({ skin_types: ["dry"], skin_concerns: [] });

  // 2. Simulate AI extraction applying { skin_types: ['sensitive'] }
  await serviceClient.rpc("apply_ai_profile_patch", {
    p_user_id: testUserId,
    p_patch: { skin_types: ["sensitive"] },
    p_spec: PROFILE_FIELD_SPEC,
  });

  // 3. Verify final state
  const { data } = await serviceClient
    .from("user_profiles")
    .select("skin_types")
    .eq("user_id", testUserId)
    .single();

  expect(data?.skin_types).toEqual(["dry", "sensitive"]); // M1 + AI union
});

it("M1: AI는 사용자 명시 age_range 덮어쓰기 불가", async () => {
  await startOnboarding({ skin_types: ["dry"], skin_concerns: [], age_range: "25-29" });

  await serviceClient.rpc("apply_ai_profile_patch", {
    p_user_id: testUserId,
    p_patch: { age_range: "30-34" },
    p_spec: PROFILE_FIELD_SPEC,
  });

  const { data } = await serviceClient
    .from("user_profiles")
    .select("age_range")
    .eq("user_id", testUserId)
    .single();
  expect(data?.age_range).toBe("25-29"); // M1: 불변
});

it("DB CHECK — skin_types 4개 INSERT 시 violation", async () => {
  await expect(
    serviceClient.from("user_profiles").insert({
      user_id: crypto.randomUUID(),
      language: "en",
      skin_types: ["dry", "oily", "sensitive", "normal"],
    }),
  ).rejects.toThrow(/check constraint/i);
});
```

- [ ] **Step 2: Run**

```bash
bun test src/__tests__/integration/profile-routes.integration.test.ts
```

Expected: PASS (may need `CHECK` assertion adjustment based on Supabase error surface).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/integration/profile-routes.integration.test.ts
git commit -m "test(NEW-17): profile integration — 합집합 E2E + M1 + DB CHECK 회귀"
```

---

## Task 20: 전체 테스트 + 타입 + lint 재확인

- [ ] **Step 1: Full suite**

```bash
bun run type-check && bun run lint && bun test
```

Expected: all PASS. Previous count 839/839 + NEW-17 추가분 (merge 18건, RPC sync 8건, route 5건, derived 6건, chat 2건, OnboardingChips 3건 = ~42건). 목표 881+ pass.

- [ ] **Step 2: Build**

```bash
bun run build
```

Expected: clean build.

- [ ] **Step 3: Commit (no code change, just checkpoint)**

Only if there were fixup edits; otherwise skip.

---

## Task 21: 정본 문서 갱신 (V-23, V-25)

**Files:**
- Modify: `docs/03-design/schema.dbml`
- Modify: `docs/03-design/PRD.md`
- Modify: `docs/05-design-detail/api-spec.md`
- Modify: `docs/05-design-detail/tool-spec.md`
- Modify: `docs/05-design-detail/system-prompt-spec.md`

- [ ] **Step 1: schema.dbml — user_profiles**

Replace (line ~100):
```
skin_type text [note: 'UP-1: dry/oily/combination/sensitive/normal']
```
with:
```
skin_types text[] [note: 'UP-1: NEW-17 복수값(max 3). dry/oily/combination/sensitive/normal. CHECK: array_length <= 3']
```

Add to table Note: `NEW-17: user_profiles.skin_type 단일 → skin_types 배열(max 3) 전환 (migration 015/016).`

- [ ] **Step 2: PRD.md §4-A UP-1**

Find the UP-1 section and update:
```
UP-1: skin_type (반영구)
  - 기존: 단일 enum (dry/oily/combination/sensitive/normal)
  - NEW-17 (2026-04-15): 최대 3개 복수 선택 가능 (skin_types text[])
  - 배경: 실제 사용자 피부는 복합적(건성+민감 등). products.skin_types 대칭성 확보.
```

- [ ] **Step 3: api-spec.md §2.3**

Update onboarding Start body / PUT body / GET response 스키마에서 `skin_type: string` → `skin_types: string[] (min 1, max 3)`.

- [ ] **Step 4: tool-spec.md §3 extract_user_profile**

Replace `skin_type: enum nullable` → `skin_types: array<enum> nullable`. Remove `learned_preferences` entry + note "NEW-17c로 분리".

- [ ] **Step 5: system-prompt-spec.md**

Update User Profile section 렌더 표기에서 "Skin type: {value}" → "Skin types: {comma-joined values or 'not specified'}".

- [ ] **Step 6: Commit**

```bash
git add docs/03-design/schema.dbml docs/03-design/PRD.md docs/05-design-detail/api-spec.md docs/05-design-detail/tool-spec.md docs/05-design-detail/system-prompt-spec.md
git commit -m "docs(NEW-17): 정본 문서 갱신 — schema/PRD/api-spec/tool-spec/system-prompt"
```

---

## Task 22: TODO.md — NEW-17 완료 + 커밋

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: NEW-17 row 업데이트**

Find NEW-17 row in TODO.md and replace status `⬜` → `✅`, update description tail:
```
**완료 (2026-04-XX)**. merge 정책 + skin_types 배열화 + RPC 원자 구현. 테스트 881+ pass. migration 015/015b 적용. migration 016는 배포 후 수동 적용 대기. 정본: `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` v1.1
```

- [ ] **Step 2: 진행률 표 재계산**

Phase 2 MVP 잔여 1 감소.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs(NEW-17): TODO 완료 표시"
```

---

## Task 23: 최종 검증 — 로컬 E2E smoke

- [ ] **Step 1: 로컬 dev 서버 기동**

```bash
bun run dev
```

- [ ] **Step 2: Playwright E2E smoke (수동 또는 자동)**

시나리오:
1. 신규 세션 생성 → OnboardingChips 노출 확인
2. skin_types 2개 선택 (dry, sensitive) → Start → 201
3. `/api/profile` GET → `skin_types: ["dry", "sensitive"]` 확인
4. 채팅: "I also get oily in T-zone" 전송 → LLM extract 기대
5. 응답 수신 후 `/api/profile` 재조회 → `skin_types: ["dry", "sensitive", "oily"]` 확인 (합집합 + cap)
6. Kit CTA 플로우 회귀 확인 (NEW-10 무영향)

- [ ] **Step 3: Vercel Logs 확인**

```bash
# 로컬 로그에서 예상 메시지 확인
# - [derived] ingredient conflict (충돌 케이스 발생 시)
# - RPC 에러 로그 0건
```

- [ ] **Step 4: Final commit & push**

```bash
git log --oneline feat/new-17-profile-merge ^main
git push -u origin feat/new-17-profile-merge
```

- [ ] **Step 5: PR 생성 안내**

`/gstack-ship` 또는 `gh pr create` 로 PR 생성. 제목: `feat(NEW-17): 프로필 merge 정책 + skin_types 배열화`.

---

## Deployment Runbook (NEW-17 고유)

### 단계 1 — Migration 015/015b 적용
- Supabase SQL Editor로 프로덕션에 015, 015b 순차 실행
- 확인: `SELECT proname FROM pg_proc WHERE proname LIKE 'apply_ai_%_patch';` → 2 rows
- 백필 확인: `SELECT count(*) FROM user_profiles WHERE skin_type IS NOT NULL AND skin_types IS NULL;` → 0
- CHECK 확인: `SELECT count(*) FROM user_profiles WHERE skin_types IS NOT NULL AND array_length(skin_types, 1) > 3;` → 0

### 단계 2 — 코드 배포 (Vercel merge → main)
- PR merge → Vercel 자동 배포
- 배포 완료 후 `/api/profile` GET 응답에 `skin_types` 필드 포함 확인

### 단계 3 — 배포 윈도우 모니터링 (DO-7)
- 배포 완료 후 5~10분 내 다음 쿼리 실행:
```sql
SELECT user_id
FROM user_profiles
WHERE skin_type IS NOT NULL
  AND (skin_types IS NULL OR NOT (skin_types @> ARRAY[skin_type]));
```
- 결과 0 rows 확인. 1+ rows면 수동 백필 UPDATE 수행.

### 단계 4 — 24~72h 관측 후 Migration 016
- 사용자 피드백 + 에러 로그 관측
- 이상 없으면 `016_drop_profile_skin_type.sql` 실행
- 이 시점 이후 롤백은 DB backup 의존

---

## Self-Review

**Spec coverage check:**
- ✅ §1 원칙 M1~M6 → Task 4/5 RPC + Task 7 merge.ts
- ✅ §2 Migration 015/015b/016 → Task 4/5/6
- ✅ §3 shared 계층 → Task 1/2
- ✅ §4 server 계층 → Task 7/8/10/11/12/13/14/15/16
- ✅ §5 client 계층 → Task 17/18
- ✅ §6 데이터 흐름 → Task 19 E2E
- ✅ §7 무결성/정합성/일관성 → Task 9 sync test + Task 19
- ✅ §8 규칙 → 모든 task가 TDD + commit 패턴
- ✅ §9 테스트 → Task 7/9/10/11/12/14/17/19
- ✅ §10 병렬 레인 → 본 plan은 serialized execution이나 상위 레인 매핑 유지
- ✅ §11 NOT in scope → plan에서 건드리지 않음 (CQ-1만 예외)
- ✅ §12 정본 갱신 → Task 21
- ✅ §13 리뷰 결과 → 이미 v1.1 스펙에 기록
- ✅ §14 참조 → 스펙 참조 유지

**Placeholder scan:**
- 모든 step은 실제 코드 또는 실행 명령 포함. "TODO" / "TBD" / "implement later" 검색 → 0건.

**Type consistency:**
- `skin_types: SkinType[]` 일관 사용 (profile.ts 타입 → service.ts → routes → UI)
- `applyAiExtraction` / `applyAiExtractionToJourney` 시그니처 모든 호출부 동일
- `PROFILE_FIELD_SPEC.skin_types.max` 단일 원천 (4곳 참조: zod, UI count, UI max prop, profile spec)
- `computeProfilePatch` / `mergeExtractionResults` export 이름 일관

**Gaps found: 0**

---

## Task List Summary

| # | 제목 | 파일 수 | 핵심 산출 |
|---|------|---------|-----------|
| 1 | 필드 스펙 레지스트리 | 2 | PROFILE/JOURNEY_FIELD_SPEC |
| 2 | types skin_types 배열화 | 1 | UserProfileVars 갱신 |
| 3 | v0.2 wizard 삭제 | 5 | CQ-1 |
| 4 | Migration 015 + RPC | 1 | apply_ai_profile_patch |
| 5 | Migration 015b + RPC | 1 | apply_ai_journey_patch |
| 6 | Migration 016 | 1 | 구 컬럼 DROP (대기) |
| 7 | merge.ts 참조 구현 | 2 | 18+ unit tests |
| 8 | profile service wrapper | 2 | applyAi* + ProfileRow |
| 9 | RPC↔TS sync test | 1 | 8+ integration cases |
| 10 | profile routes zod | 2 | startOnb + PUT 스키마 |
| 11 | chat afterWork | 2 | mergeExtractionResults + RPC |
| 12 | extraction-handler | 2 | skin_types + learned_prefs 제거 |
| 13 | chat service ctx | 1 | skin_types 전달 |
| 14 | derived + resolveConflicts | 2 | 배열 시그니처 + 충돌 정책 |
| 15 | search-handler | 2 | wrapper 제거 |
| 16 | prompts 렌더 | 2 | 복수 표시 |
| 17 | OnboardingChips UI | 2 | 다중 선택 |
| 18 | ProfileCard | 1 | 배열 렌더 |
| 19 | profile integration E2E | 1 | 합집합 + M1 + CHECK |
| 20 | 전체 검증 | 0 | type/lint/test/build |
| 21 | 정본 문서 갱신 | 5 | schema/PRD/api/tool/system |
| 22 | TODO 완료 | 1 | NEW-17 ✅ |
| 23 | E2E + push | 0 | PR 준비 |

**총 예상 커밋**: 22개
**총 예상 LoC 변경**: +1200 / -300 (대략)
**예상 실행 시간**: CC 기준 4-6시간 (병렬 레인 활용 시 단축)
