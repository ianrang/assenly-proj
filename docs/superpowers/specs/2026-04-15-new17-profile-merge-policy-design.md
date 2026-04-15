# NEW-17 — 프로필 merge 정책 + skin_types 배열화 설계

> **정본**: 이 문서는 NEW-17 구현의 단일 정본. 상위 정본(PRD §4-A UP-1, schema.dbml §user_profiles, tool-spec §3)이 본 설계대로 갱신되어야 함.
> **범위**: `extract_user_profile` tool(AI 소스)과 `POST /api/profile/onboarding` / `PUT /api/profile`(사용자 소스) 간 쓰기 경합 정책 확립 + `user_profiles.skin_type` 단일 → `skin_types TEXT[]` 배열화.
> **검토**: `/gstack-plan-eng-review` CLEAR (2026-04-15). 4 issues / 0 critical gaps / 0 unresolved.

## 1. 목적과 원칙

### 1.1 해결하는 문제

현재 `user_profiles` 쓰기 경로는 4곳이며 3가지 소스가 섞여 있다:

1. `POST /api/profile/onboarding` Start — **사용자 명시**
2. `POST /api/profile/onboarding` Skip — 사용자 명시(language만)
3. `PUT /api/profile` — **사용자 명시**(부분)
4. `chat.ts` onFinish afterWork — **AI 추출(extract_user_profile tool 결과)**

4번이 1~3번의 결과를 덮어쓸 수 있다(last-write-wins). 또한 `skin_type`이 단일 enum이라 현실의 복합 피부(건성+민감 등)를 표현 불가. NEW-17은 (a) 덮어쓰기 방지, (b) 배열화를 함께 해결한다.

### 1.2 불변 원칙

| ID | 원칙 | 강제 수단 |
|----|------|-----------|
| **M1** | 사용자 명시값은 AI에 의해 제거·덮어쓰기되지 않는다 | Postgres RPC `apply_ai_profile_patch`의 `COALESCE` / 조건부 UPDATE |
| **M2** | 배열 필드는 spec.max를 초과 저장하지 않는다 | **4중 방어**: UI / zod / RPC / DB CHECK |
| **M3** | scalar AI 쓰기는 existing이 비어있을 때만 | RPC 조건부 UPDATE |
| **M4** | AI 추출 실패는 사용자 응답을 차단하지 않는다 | Q-15 (chat.ts onFinish try-catch) |
| **M5** | 멱등성: 동일 입력 재호출은 no-op | RPC의 array dedup + scalar 존재 확인 |
| **M6** | onboarding_completed_at 원샷 | NEW-9b migration 014 유지 |

## 2. 데이터 모델 변경

### 2.1 Migration 015 — skin_types 배열화 + AI patch RPC

```sql
-- supabase/migrations/015_profile_skin_types_array.sql

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

-- Step 4. AI patch RPC (원자적 merge + 쓰기)
--   M1 M2 M3 M5 를 단일 SQL 트랜잭션에서 강제.
--   spec jsonb 인자는 { field: { cardinality, aiWritable, max } } 형태.
--   patch jsonb 는 { field: value | array } (null 필드는 patch에서 생략).
--   반환: applied 필드명 배열.
CREATE OR REPLACE FUNCTION apply_ai_profile_patch(
  p_user_id uuid,
  p_patch jsonb,
  p_spec jsonb
) RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS 준수: 호출자 auth로 실행
AS $$
DECLARE
  v_field text;
  v_fspec jsonb;
  v_inc jsonb;
  v_applied text[] := ARRAY[]::text[];
  v_sql text;
BEGIN
  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(p_spec) LOOP
    -- aiWritable=false → skip
    IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;
    v_inc := p_patch->v_field;
    IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_fspec->>'cardinality' = 'scalar' THEN
      -- M3: existing null일 때만 set. COALESCE로 원자적 보장.
      EXECUTE format(
        'UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2 AND %I IS NULL',
        v_field, v_field
      ) USING v_inc#>>'{}', p_user_id;
      IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
    ELSE
      -- array: cur ∪ inc, max 적용, 사용자값 우선 보존.
      v_sql := format($f$
        UPDATE user_profiles
           SET %I = (
             SELECT ARRAY(
               SELECT x FROM (
                 SELECT unnest(COALESCE(%I, ARRAY[]::text[])) AS x
                 UNION
                 SELECT jsonb_array_elements_text($1)
               ) u
               LIMIT $2
             )
           ),
           updated_at = now()
         WHERE user_id = $3
           AND (
             %I IS NULL OR
             NOT (%I @> ARRAY(SELECT jsonb_array_elements_text($1)))
           )
      $f$, v_field, v_field, v_field, v_field);
      EXECUTE v_sql USING v_inc, (v_fspec->>'max')::int, p_user_id;
      IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_ai_profile_patch(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_ai_profile_patch IS
  'NEW-17: AI 추출 patch를 사용자값 보존 규약으로 원자 적용. M1/M2/M3/M5 DB 레벨 강제. merge.ts의 참조 구현과 의미론 동일 (RPC/TS sync test).';
```

### 2.2 Migration 015b — journeys AI patch RPC

```sql
-- supabase/migrations/015b_apply_ai_journey_patch.sql
--
-- journeys 테이블용 동일 의미론 RPC. active journey upsert.
-- journey 없으면 minimal journey 생성(Chat-First 시나리오).
--
-- 구조는 015의 apply_ai_profile_patch와 동일 — spec driven.
-- 차이점:
--   (a) active journey 탐색 (status='active'), 없으면 INSERT 후 patch.
--   (b) ux_journeys_user_active 유니크 인덱스와 공존 — INSERT는 ON CONFLICT 처리.

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
BEGIN
  -- active journey 확보(lazy-create)
  SELECT id INTO v_journey_id FROM journeys
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO journeys (user_id, status, country, city, created_at)
    VALUES (p_user_id, 'active', '', '', now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_journey_id;
    -- 경합으로 이미 생성되었으면 다시 조회
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
        'UPDATE journeys SET %I = $1 WHERE id = $2 AND %I IS NULL',
        v_field, v_field
      ) USING v_inc#>>'{}', v_journey_id;
      IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
    ELSE
      -- array merge (015와 동일 패턴)
      EXECUTE format($f$
        UPDATE journeys
           SET %I = (
             SELECT ARRAY(
               SELECT x FROM (
                 SELECT unnest(COALESCE(%I, ARRAY[]::text[])) AS x
                 UNION
                 SELECT jsonb_array_elements_text($1)
               ) u
               LIMIT $2
             )
           )
         WHERE id = $3
           AND (%I IS NULL OR NOT (%I @> ARRAY(SELECT jsonb_array_elements_text($1))))
      $f$, v_field, v_field, v_field, v_field)
      USING v_inc, (v_fspec->>'max')::int, v_journey_id;
      IF FOUND THEN v_applied := array_append(v_applied, v_field); END IF;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_ai_journey_patch(uuid, jsonb, jsonb) TO authenticated;
```

### 2.3 Migration 016 — 구 컬럼 DROP (코드 배포 후 별도 실행)

```sql
-- supabase/migrations/016_drop_profile_skin_type.sql
ALTER TABLE user_profiles DROP COLUMN IF EXISTS skin_type;
```

### 2.4 배포 시퀀스 (무중단 + 롤백)

1. **015 배포** — 컬럼 추가 + 백필 + CHECK + RPC 2개. 구 코드 계속 동작.
2. **코드 배포** — 모든 읽기/쓰기 skin_types로 전환.
3. **24~72h 관측**.
4. **016 배포** — 구 skin_type DROP. 이 시점 이후 롤백은 DB backup 의존.

## 3. Shared 계층

### 3.1 `src/shared/constants/profile-field-spec.ts` (신규)

```ts
import type { UserProfileVars, JourneyContextVars } from '../types/profile';

export type ProfileFieldSpec =
  | { cardinality: 'scalar'; aiWritable: boolean }
  | { cardinality: 'array';  aiWritable: boolean; max: number };

export const PROFILE_FIELD_SPEC = {
  skin_types:    { cardinality: 'array',  aiWritable: true,  max: 3 },
  hair_type:     { cardinality: 'scalar', aiWritable: false },
  hair_concerns: { cardinality: 'array',  aiWritable: false, max: 6 },
  country:       { cardinality: 'scalar', aiWritable: false },
  language:      { cardinality: 'scalar', aiWritable: false },
  age_range:     { cardinality: 'scalar', aiWritable: true  },
} as const satisfies Record<keyof UserProfileVars, ProfileFieldSpec>;

export const JOURNEY_FIELD_SPEC = {
  skin_concerns:       { cardinality: 'array',  aiWritable: true,  max: 5 },
  interest_activities: { cardinality: 'array',  aiWritable: false, max: 5 },
  stay_days:           { cardinality: 'scalar', aiWritable: true  },
  start_date:          { cardinality: 'scalar', aiWritable: false },
  end_date:            { cardinality: 'scalar', aiWritable: false },
  budget_level:        { cardinality: 'scalar', aiWritable: true  },
  travel_style:        { cardinality: 'array',  aiWritable: false, max: 7 },
} as const satisfies Record<keyof JourneyContextVars, ProfileFieldSpec>;

export const MAX_SKIN_TYPES = PROFILE_FIELD_SPEC.skin_types.max; // 3
```

**준수**: L-13 순수 상수 / L-16 constants → types 단방향 / G-10 매직 넘버 단일 원천.

### 3.2 `src/shared/types/profile.ts` 수정

```ts
export interface UserProfileVars {
  skin_types: SkinType[];               // ← 단일 → 배열. 빈 배열 = '없음'
  hair_type: HairType | null;
  hair_concerns: HairConcern[];
  country: string | null;
  language: SupportedLanguage;
  age_range: AgeRange | null;
}
```

**규약**: scalar→array 전환 필드는 `null` 대신 `[]`로 "없음" 표현. `?? []` 정규화는 **`getProfile` 반환부 1곳**(service.ts)에서만 수행(CQ-2).

### 3.3 `OnboardingFormData` 삭제 (CQ-1)

v0.2 full-wizard 컴포넌트(`OnboardingWizard.tsx`, `StepSkinHair.tsx`, `StepConcerns.tsx`, `StepInterests.tsx`, `StepTravel.tsx`) 및 `OnboardingFormData` 타입을 삭제. PRD §595 재설계로 기존 스텝 구조는 이미 낡음. v0.2 재착수 시 현행 PRD 기반으로 재작성.

## 4. Server 계층

### 4.1 `src/server/features/profile/merge.ts` (신규, 참조 구현)

```ts
import 'server-only';
import { PROFILE_FIELD_SPEC, JOURNEY_FIELD_SPEC } from '@/shared/constants/profile-field-spec';
import type { UserProfileVars, JourneyContextVars } from '@/shared/types/profile';

export type WriteSource = 'user' | 'ai';

// RPC 의미론의 TS 참조 구현.
// 프로덕션 경로는 Postgres RPC 사용. 이 함수는 (a) 단위 테스트로 규약 고정,
// (b) RPC-TS sync 테스트의 기준.
export function computeProfilePatch<TSpec extends Record<string, unknown>>(
  existing: Partial<Record<keyof TSpec, unknown>>,
  incoming: Partial<Record<keyof TSpec, unknown>>,
  source: WriteSource,
  spec: TSpec,
): { updates: Partial<Record<keyof TSpec, unknown>>; skipped: Array<{ field: string; reason: string }> } {
  // 구현: §4.2 merge 의미론과 정확히 동일 (array union + max cap + scalar null-only for ai)
  // 자세한 구현은 코드 참조.
  ...
}

// 다중 extraction 결과를 1개 patch로 pre-merge (AI-AI union, 3A 결정).
export function mergeExtractionResults(
  results: ExtractionResult[],
): { profilePatch: Partial<UserProfileVars>; journeyPatch: Partial<JourneyContextVars> } {
  // scalar: first-wins (existing=null → 첫 비-null, 이후는 무시)
  // array:  union
  ...
}
```

### 4.2 Merge 의미론 (정본)

| 케이스 | source='user' | source='ai' |
|--------|---------------|-------------|
| scalar + aiWritable=false | 대체 | skip |
| scalar + aiWritable=true, existing=null, incoming=null | skip | skip |
| scalar + aiWritable=true, existing=null, incoming=set | 대체 | 기입 |
| scalar + aiWritable=true, existing=set | 대체 | **skip (M1)** |
| array + aiWritable=false | 대체(capped) | skip |
| array + aiWritable=true, incoming=[] | 빈 배열로 대체 | skip |
| array + aiWritable=true, cur ∪ inc ≤ max | 대체(capped) | **union** |
| array + aiWritable=true, cur ∪ inc > max | cap 초과분 절단(user 값 우선) | cap 초과분 절단 (**user 값 절대 보존** — additions slice 후 [...cur, ...trimmed]) |
| array + aiWritable=true, inc ⊆ cur | 대체(capped) | no_change (skip) |

### 4.3 `src/server/features/profile/service.ts` 수정

```ts
// 기존 upsertProfile, updateProfile, createMinimalProfile, markOnboardingCompleted 유지.
// ProfileData.skin_type: string | null → skin_types: string[].
// getProfile: 반환 시 skin_types ?? [], hair_concerns ?? [] 정규화 (CQ-2).

export async function applyAiExtraction(
  client: SupabaseClient,
  userId: string,
  patch: Partial<UserProfileVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc('apply_ai_profile_patch', {
    p_user_id: userId,
    p_patch: patch,
    p_spec: PROFILE_FIELD_SPEC,
  });
  if (error) throw new Error('AI profile patch failed');
  return { applied: data ?? [] };
}

export async function applyAiExtractionToJourney(
  client: SupabaseClient,
  userId: string,
  patch: Partial<JourneyContextVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc('apply_ai_journey_patch', {
    p_user_id: userId,
    p_patch: patch,
    p_spec: JOURNEY_FIELD_SPEC,
  });
  if (error) throw new Error('AI journey patch failed');
  return { applied: data ?? [] };
}
```

### 4.4 `src/server/features/api/routes/profile.ts` 수정

```ts
const startOnboardingBodySchema = z.object({
  skin_types: z.array(skinTypeEnum).min(1).max(PROFILE_FIELD_SPEC.skin_types.max),
  hair_type: hairTypeEnum.nullable().optional(),
  hair_concerns: z.array(hairConcernEnum).default([]),
  country: z.string().min(2).max(2).optional(),
  language: languageEnum.default('en'),
  age_range: ageRangeEnum.optional(),
  skin_concerns: z.array(skinConcernEnum).max(MAX_STORED_SKIN_CONCERNS).default([]),
  interest_activities: z.array(interestActivityEnum).default(['shopping']),
  stay_days: z.number().int().positive().optional(),
  start_date: z.string().date().optional(),
  budget_level: budgetLevelEnum.optional(),
  travel_style: z.array(travelStyleEnum).default([]),
}).strict();
```

**Start 경로 동작(1B-A 확정)**: `upsertProfile`이 `skin_types`를 전체 대체. 사용자 명시 편집은 의도된 교체.

**PUT 경로**: `skin_types`가 body에 있으면 전체 대체. partial update 규약 유지.

### 4.5 `src/server/features/api/routes/chat.ts` afterWork 수정

```ts
// 기존 inline updates 수집 루프 제거.
// 3A-A 결정: pre-merge + lazy journey.

if (result.extractionResults.length > 0) {
  try {
    const { profilePatch, journeyPatch } = mergeExtractionResults(result.extractionResults);

    // user_profiles 레코드 확보 (기존 createMinimalProfile 로직 유지)
    if (!profile) {
      try { await createMinimalProfile(serviceClient, user.id, parsed.data.locale); }
      catch { /* PK 충돌 = 이미 존재 */ }
    }

    if (Object.keys(profilePatch).length > 0) {
      await applyAiExtraction(serviceClient, user.id, profilePatch);
    }
    if (Object.keys(journeyPatch).length > 0) {
      await applyAiExtractionToJourney(serviceClient, user.id, journeyPatch);  // journey lazy-create
    }
  } catch (error) {
    // M4 / Q-15: 비동기 쓰기 격리
    console.error('[chat/afterWork] AI extraction apply failed', String(error));
  }
}
```

### 4.6 `src/server/features/chat/tools/extraction-handler.ts` 수정

```ts
export const extractUserProfileSchema = z.object({
  skin_types: z.array(
    z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])
  ).nullable()
    .describe('Skin types if mentioned. Can be multiple (e.g., combination+sensitive). null if not mentioned.'),

  skin_concerns: z.array(
    z.enum(['acne','wrinkles','dark_spots','redness','dryness','pores','dullness','dark_circles','uneven_tone','sun_damage','eczema'])
  ).nullable()
    .describe('Skin concerns if mentioned. null if not mentioned.'),

  stay_days:    z.number().nullable(),
  budget_level: z.enum(['budget','moderate','premium','luxury']).nullable(),
  age_range:    z.enum(['18-24','25-29','30-34','35-39','40-49','50+']).nullable(),

  // learned_preferences 삭제 — NEW-17c로 분리
});
```

### 4.7 `src/server/features/beauty/derived.ts` 수정

```ts
export function calculatePreferredIngredients(
  skinTypes: SkinType[],                 // ← 단일 → 배열
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
    if (pref.category === 'ingredient' && pref.direction === 'like') {
      ingredients.add(pref.preference);
    }
  }
  return [...ingredients];
}

export function calculateAvoidedIngredients(
  skinTypes: SkinType[],                 // ← 단일 → 배열
  learnedDislikes: LearnedPreference[],
): string[] {
  const ingredients = new Set<string>();
  for (const t of skinTypes) {
    for (const ing of SKIN_TYPE_CAUTION[t] ?? []) ingredients.add(ing);
  }
  for (const pref of learnedDislikes) {
    if (pref.category === 'ingredient' && pref.direction === 'dislike') {
      ingredients.add(pref.preference);
    }
  }
  return [...ingredients];
}

/**
 * 2A-A 결정: avoided 우선 — 복수 skin_types에서 preferred ∩ avoided 발생 시
 * avoided에 남기고 preferred에서 제거. 민감 피부 안전 우선. 충돌 관측용 로그.
 */
export function resolveConflicts(
  preferred: string[],
  avoided: string[],
): { preferred: string[]; avoided: string[] } {
  const avoidedSet = new Set(avoided);
  const conflicts = preferred.filter((p) => avoidedSet.has(p));
  if (conflicts.length > 0) {
    console.warn('[derived] ingredient conflict — avoided wins', { conflicts });
  }
  return { preferred: preferred.filter((p) => !avoidedSet.has(p)), avoided };
}
```

호출부(`search-handler.ts`)는 두 계산 후 `resolveConflicts`로 후처리.

### 4.8 기타 소비자 변경 (narrow renames)

| 파일 | 변경 |
|------|------|
| `chat/tools/search-handler.ts:97` | wrapper 제거 → `profile?.skin_types` 직접 전달 |
| `chat/tools/search-handler.ts` | `calculatePreferredIngredients/calculateAvoidedIngredients` 호출 후 `resolveConflicts` 적용 |
| `chat/prompts.ts:331` | `profile.skin_types.length > 0 ? profile.skin_types.join(', ') : 'not specified'` |
| `chat/service.ts:79` | ctx에 `skin_types: profile.skin_types ?? []` 전달 |
| `client/features/profile/ProfileCard.tsx` | `skin_types.map` 렌더 |

## 5. Client 계층

### 5.1 `OnboardingChips.tsx` 수정

```tsx
const [skinTypes, setSkinTypes] = useState<SkinType[]>([]);  // ← 단일 → 배열

<OptionGroup
  options={skinOptions}
  value={skinTypes}
  onChange={(v) => setSkinTypes(v as SkinType[])}
  mode="multiple"
  max={PROFILE_FIELD_SPEC.skin_types.max}
/>

// Start 버튼: disabled={skinTypes.length === 0 || isSubmitting}
// payload: { skin_types: skinTypes, skin_concerns: concerns }
```

i18n 키(`onboarding.skinType` / `onboarding.skinType_*`) 재사용. 신규 키 불요.

## 6. 데이터 흐름

### 6.1 Primary flow (Start)

```
User → OnboardingChips ['dry','sensitive']
    → POST /api/profile/onboarding
    → persistOnboarding (source=user)
        → upsertProfile { skin_types: ['dry','sensitive'], ... }
        → createOrUpdateJourney
        → markOnboardingCompleted
    → 201
```

### 6.2 Post-onboarding AI extraction

```
User chat "my T-zone is oily"
    → LLM tool extract_user_profile { skin_types: ['oily'] }
    → chat afterWork
        → mergeExtractionResults (N→1)
        → applyAiExtraction → RPC
            → RPC internal: cur=['dry','sensitive'], inc=['oily']
            → union capped at 3: ['dry','sensitive','oily']
            → UPDATE user_profiles SET skin_types=... WHERE user_id AND cond
        → applied=['skin_types']
```

### 6.3 Cap 도달 시

```
cur=['dry','sensitive','oily']  (max 3)
inc=['combination']
    → RPC union 결과 길이 4 → LIMIT 3 적용. cur이 먼저 unnest되어 보존.
    → UPDATE 조건 `NOT cur @> inc`에서 ['combination'] ⊄ cur → 매치.
    → 결과: cur 그대로. 다만 FOUND=true로 applied 반환될 수 있음.
    → 보정: RPC 조건을 `(len(cur) + len(inc \ cur)) > 0 AND ...` 로 세밀화하여 no-op 시 NOT FOUND 보장.
```

> **주의**: 위 SQL은 스켈레톤. 구현 시 cap 도달 후 실제 변경이 없는 경우 `UPDATE ... WHERE ...` 조건을 "차집합이 비어있지 않음"으로 강화하여 멱등 no-op을 보장한다. 통합 테스트로 검증.

### 6.4 멀티탭 동시 쓰기

```
Tab1: AI extract ['oily']  ┐
Tab2: AI extract ['sensitive'] ├─ RPC 동시 실행
                               │   → 각각 단일 UPDATE, Postgres row-level lock
                               │   → 직렬화됨. 최종 cur = ['dry','oily','sensitive']
                               ↓
                             M1 유지, 둘 다 반영
```

## 7. 데이터 무결성/정합성/일관성

| 축 | 방어 | 검증 |
|----|------|------|
| 무결성 (상한) | UI max / zod max / RPC LIMIT / DB CHECK | M2 4중 |
| 무결성 (열거값) | zod enum / tool schema enum | Q-14 |
| 정합성 (schema ↔ types ↔ validation) | 단일 원천 PROFILE_FIELD_SPEC | RPC/TS sync test |
| 정합성 (API ↔ DB) | migration 015 + route zod | 회귀 테스트 |
| 일관성 (동시성) | 원자 RPC | TOCTOU 제거 |
| 일관성 (partial commit user_profiles + journeys) | Q-15 격리 + 멱등 자기치유 | 다음 턴 재수렴 |

## 8. 규칙 준수 체크 (V-*)

V-1~V-26 모두 통과 (상세: eng-review 리뷰 기록). 특기 사항:

- **V-3/V-4**: Composition Root(routes)에서 profile ↔ journey 조합. service 간 직접 import 0.
- **V-9/V-10**: 중복/미사용 export 제거 — v0.2 wizard 삭제(CQ-1), learned_preferences 제거.
- **V-16**: shared constants/ → types/ 단방향.
- **V-17**: profile/merge.ts 제거 시 service.applyAiExtraction 빌드 에러만 발생. 외부 영향 0.
- **V-19/V-20**: 복합 쓰기 원자성 — RPC 1건으로 해결 (Q-11). 멱등 — RPC dedup.
- **V-22**: zod enum ↔ DB CHECK 일치.

## 9. 테스트

§3 coverage diagram 참조. 핵심:

1. **merge.test.ts** — `computeProfilePatch` 13+ 케이스 (scalar/array × source × existing states × cap)
2. **RPC/TS sync test** — 동일 `(existing, incoming, source)` 20건을 TS 참조 구현 vs RPC에 적용해 결과 일치
3. **service.test.ts** — applyAiExtraction / applyAiExtractionToJourney RPC wrapper 에러 전파
4. **profile routes test** — skin_types 배열 payload zod 경계 (0/1/3/4개)
5. **chat routes test** — afterWork mergeExtractionResults + RPC 경로
6. **derived.test.ts** — 복수 skin_types union + resolveConflicts 3 케이스
7. **OnboardingChips.test.tsx** — 다중 선택 UI + payload
8. **Integration** — Start + 이후 AI extraction → DB 합집합 최종 상태
9. **Eval harness** — extraction tool schema 변경 후 Run 9 baseline 재측정

## 10. 병렬 실행 레인

| Lane | Modules | Depends |
|------|---------|---------|
| A | `supabase/migrations/{015,015b,016}.sql` | — |
| B | `src/shared/constants/profile-field-spec.ts`, `src/shared/types/profile.ts` | — |
| C | `src/server/features/profile/merge.ts` + test | B |
| D | `src/server/features/profile/service.ts` + test | A, B |
| E | `src/server/features/api/routes/{profile,chat}.ts` + tests | D |
| F | `src/server/features/beauty/derived.ts` + test, `src/server/features/chat/{prompts,service,tools/search-handler,tools/extraction-handler}.ts` + tests | B |
| G | `src/client/features/chat/OnboardingChips.tsx`, `src/client/features/profile/ProfileCard.tsx` + tests | B |
| H | v0.2 wizard 파일 삭제 (CQ-1) | — |
| I | `docs/**` 정본 갱신 (schema.dbml, PRD, api-spec, tool-spec, system-prompt-spec) | — |

**Execution**: A+B+H+I 병렬 → B 완료 후 C+F+G 병렬 → A+B 후 D → C+D 후 E.

## 11. NOT in scope

- `learned_preferences` 저장 경로 — **NEW-17c** (v0.2 후보)
- `hair_type` 배열화 — v0.2
- provenance 컬럼 — 직교 축, 필요 시 무충돌 추가
- Advisory lock — RPC 원자성으로 불필요
- OnboardingChips AI 프리필 UX — 제품 결정(1B-A)으로 미채택
- 다국어 skin_types 정렬 규약 — 추후
- Supabase Pro 업그레이드(백업) — P3-31 v0.2

## 12. 정본 갱신 체크리스트

| 문서 | 변경 |
|------|------|
| `docs/03-design/schema.dbml` | user_profiles.skin_type 삭제 + skin_types text[] (max 3) |
| `docs/03-design/PRD.md` §4-A UP-1 | skin_type 단일 → 최대 3개 복수 |
| `docs/05-design-detail/api-spec.md` §2.3 | onboarding/PUT body + GET response skin_types |
| `docs/05-design-detail/tool-spec.md` §3 | extract_user_profile: skin_type → skin_types, learned_preferences 삭제 |
| `docs/05-design-detail/system-prompt-spec.md` | User Profile 섹션 skin_types 렌더 |
| `TODO.md` NEW-17 | 완료 시 ✅ + 구현 요약 |

## 13. 리뷰 결과

- `/gstack-plan-eng-review`: CLEAR (2026-04-15, commit 0c935b4)
- 4 issues (모두 recommended 채택으로 해소), 0 critical gaps, 0 unresolved
- Lake score: 4/4 complete option 채택

## 14. 참조

- NEW-9b 정본: `docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md`
- Migration 014 패턴: `supabase/migrations/014_onboarding_completion_gate.sql`
- 추출 tool: `src/server/features/chat/tools/extraction-handler.ts`
- 경합 기록: TODO.md NEW-17 (adversarial review C8)
- 후속: TODO.md NEW-17c (learned_preferences 재검토)
