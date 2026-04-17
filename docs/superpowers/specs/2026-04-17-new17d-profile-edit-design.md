# NEW-17d: 프로필 편집 UX 경로 설계

- 작성일: 2026-04-17
- 정본 상태: v1.1 (`/gstack-plan-eng-review` + Claude subagent outside voice 반영 완료)
- 작성자: 브레인스토밍 세션 (사용자 + Claude)
- 선행 설계:
  - `2026-04-15-new17-profile-merge-policy-design.md` v1.1 (NEW-17 profile merge 정본)
  - `2026-04-16-new17b-rpc-hardening-design.md` v1.2 (NEW-17b RPC 하드닝 정본)
- DB 정본: `docs/03-design/schema.dbml` §user_profiles, §journeys
- 요구사항 정본: `docs/03-design/PRD.md` §4-A (프로필 필드 정의)
- 작업 단위: 단일 브랜치 `feat/new-17d-profile-edit-ui` (예정)
- 관련 follow-up: NEW-17f (배포 윈도우 trigger), NEW-17h (search_path + 테스트 격리)

---

## §1. 배경

### 1.1 문제

NEW-17 시리즈 완료 후에도 사용자가 **온보딩 완료 이후 `skin_types` / `skin_concerns` 를 수정할 UI 경로가 0개** 다. 2026-04-16 `/gstack-review` 디자인 전문가가 지적한 치명적 결함이다.

- `OnboardingChips` 는 `onboarding_completed_at IS NULL` 조건부 표시 → 1회성 게이트 (`markOnboardingCompleted` 의 I4 불변량에 의해 재노출 불가)
- `/profile` (`ProfileClient.tsx`) 는 읽기 전용 — 이전 T3 디프리케이션으로 Edit 버튼 제거됨 (`messages/en.json` 에 `profile.edit` 키 부재)
- 유일한 사후 갱신 경로는 LLM `extract_user_profile` tool → `applyAiExtraction` RPC (AI 경로)

### 1.2 문제의 폭

사용자가 프로필을 수정할 의도가 생겨도:
- `/profile` 방문 시 "Continue to chat" 버튼만 존재
- 채팅에서 "skin type 바꿔줘" 라고 말해도 `apply_ai_profile_patch` 의 M1 가드 (사용자 기존 scalar 값 보존) 때문에 **실제로 바뀌지 않음**
- 배열 필드(`skin_types`)는 merge 될 뿐 제거 불가 → 사용자는 "내가 선택한 oily 를 제거하고 싶다" 는 의지를 표현할 수단이 없음

### 1.3 선행 완료 작업의 가치 보존

NEW-17 / 17a / 17b 는 **백엔드 스키마 + RPC 보안** 을 해결했다. NEW-17d 는 그 위에 **사용자 명시 입력 UI** 를 올리는 **논리적 완결 작업** 이다. 본 설계가 없으면 `user_profiles.skin_types TEXT[]` 배열 구조의 실용적 가치가 제한된다.

### 1.4 Q3 검증에서 식별된 semantic 결함 (I-1)

브레인스토밍 Q3 엄격 검증 중 발견:

```
T0 : DB skin_types = ['oily', 'sensitive']            (온보딩 시 사용자 선택)
T1 : 사용자 /profile/edit → skin_types = ['dry']       (oily, sensitive 의도적 삭제)
T2 : apply_user_explicit_edit SET skin_types = ['dry'] (REPLACE)
T3 : 사용자 채팅 "My oily area on nose..." 언급
T4 : LLM extract_user_profile → skin_types = ['oily']
T5 : apply_ai_profile_patch 의 CR-1 priority merge
     → UPDATE skin_types = ['dry', 'oily']            ❌ 재부활
```

NEW-17 M1 가드는 "preserve user non-null" 만 보장, "honor user deletion" 미커버. 본 설계에서 해결한다 (Time-Decay Lock, §9).

---

## §2. 결정 사항 요약

| Q | 결정 | 근거 §  |
|---|---|---|
| 접근 방식 | **Option C** — 전용 편집 폼 | §3 |
| 레이아웃 | **L-1** — 전용 페이지 `/[locale]/profile/edit` | §4 |
| 편집 범위 | **M+** — 7 필드 | §5 |
| 트랜잭션 | **J-3** — DB Atomic RPC | §7 |
| AI 우선순위 | **P-3** — Time-Decay Lock (기본 30일) | §9 |
| 폼 UI 패턴 | **Field Registry** | §6 |
| 보안 모델 | **3-β** — SECURITY INVOKER + authenticated GRANT + RLS | §10 |
| beauty_summary | 편집 시 `NULL` 재설정 (LLM 자동 재생성) | §11 |

---

## §3. 접근 방식 — Option C (전용 편집 폼)

### 3.1 검토한 대안

- **Option A** (/profile CTA → 채팅 리다이렉트): 아키텍처 레벨에서 M1 가드 충돌. AI가 사용자 기존 값을 못 바꿈 → silent fail. **탈락**
- **Option B** (채팅 내 `update_user_profile` tool): Discoverability 부재 + LLM 파싱 정확도 의존. NEW-28 에서 확인된 긴 한국어 프롬프트 tool 호출률 저하 리스크. **탈락**
- **Option C** (전용 편집 폼): 표준 form UX + AI 경로와 완전 분리 + OnboardingChips 자산 재사용.

### 3.2 6개 전문가 패널 점수 (Option C 전체 최고)

| 관점 | A | B | C |
|---|---:|---:|---:|
| UI/UX | 4 | 6 | **9** |
| 서비스 기획 | 5 | 6 | **8** |
| 수석 아키텍처 | 5 | 6 | **9** |
| AI 엔지니어 | 4 | 5 | **9** |
| 백엔드 | 4 | 5 | **9** |
| 프론트엔드 | 6 | 5 | **8** |
| 합계/60 | 28 | 33 | **52** |

---

## §4. 레이아웃 — L-1 전용 페이지

### 4.1 결정

`/[locale]/profile/edit` 신규 라우트. 기존 `/privacy`, `/terms`, `/profile` 과 동일한 `(pages)` route group 에 배치.

### 4.2 경쟁 대안 탈락 사유

- **L-2 Sheet 모달**: 7필드 스크롤 + 하단 고정 Save 버튼 높이 경쟁. 필드 확장 시 리팩토링 불가피.
- **L-3 인라인 토글**: `ProfileClient.tsx` 가 101줄 → Edit 모드 추가 시 Q-5 (컴포넌트 ≤200줄) 초과 위험. 단일 책임 위반.

### 4.3 UX 흐름

```
/profile                               (기존 읽기 전용)
  ├── ProfileCard (변경 없음)
  ├── [Show my picks → /chat] 버튼   (기존, i18n: profile.continue)
  └── [Edit profile → /profile/edit]  ← 신규 (i18n: profile.edit)

   ↓ (Edit 클릭)

/profile/edit                          (신규)
  ├── 섹션 × 6 (Field Registry iterate, MVP 기준)
  ├── Save 버튼 (primary CTA, i18n: profile.save)
  └── Cancel 버튼 (secondary, i18n: profile.cancel)

   ↓ Save 성공

/profile (redirect)                    (새 값 렌더링)
```

### 4.4 설계 결정

- **prefetch**: Next.js App Router `<Link prefetch>` 로 편집 페이지 즉시 로드
- **unsaved changes guard**: 편집 중 뒤로가기 시 `AlertDialog` 로 변경 손실 경고 (기존 primitive 재사용)
- **로딩**: 편집 페이지 진입 시 GET `/api/profile` 로 현재 값 pre-fill (스켈레톤 표시 패턴 재사용)

---

## §5. 편집 범위 — M+

### 5.1 포함 필드 (MVP 6개 + country v0.2 연기)

| # | 필드 | 테이블 | cardinality | max | aiWritable | MVP | Section i18n key |
|---|---|---|---|---|---|---|---|
| 1 | `skin_types` | user_profiles | array | 3 | true | ✅ | `profile.skinType` |
| 2 | `skin_concerns` | journeys | array | 5 | true | ✅ | `profile.skinConcerns` |
| 3 | `hair_type` | user_profiles | scalar | - | false | ✅ | `profile.hairType` |
| 4 | `hair_concerns` | user_profiles | array | 6 | false | ✅ | `profile.hairConcerns` |
| 5 | `budget_level` | journeys | scalar | - | true | ✅ | `profile.budget` |
| 6 | `age_range` | user_profiles | scalar | - | true | ✅ | `profile.age` |
| 7 | `country` | user_profiles | scalar | - | false | 🟡 v0.2 | `profile.country` |

**MVP 실질 편집 범위**: 6 필드. country 는 §5.4 근거로 v0.2 로 연기.

### 5.2 제외 필드 (명시적)

- **`language`** (user_profiles, NOT NULL): 편집 폼에서 배제. 언어 전환은 루트 LanguageSelector (URL `/:locale`) 로만. zod 스키마에서 `.strict()` 로 들어오면 400.
- **`stay_days`, `start_date`, `end_date`** (journeys): 여행 일정은 채팅 흐름으로 수집 (AI extract가 잘 수행 중).
- **`travel_style`, `interest_activities`** (journeys): 여행마다 변경, AI extract 경로 충분.
- **`beauty_summary`** (user_profiles): AI 생성 필드, 사용자 직접 편집 불가. §11 참조.
- **`onboarding_completed_at`** (user_profiles): I4 불변량. 편집 스키마에서 완전 배제.

### 5.3 범위 결정 근거

- **M+** 합계 50/60, 범위 L (표시 필드 전체) 41/60 대비 우위
- NEW-17d 원 목표 (skin_types + skin_concerns) 포함
- 사용자 멘탈 모델: AI가 못 맞히는 정체성 필드 (country, age_range, hair)를 사용자 교정 가능
- 복잡도 관리: profile + journey 2 테이블 쓰기만 (L-4,5,6,7 고려).

### 5.4 Country 필드 특수 처리

`country` 는 이론상 200개+ 국가로 chip UI 부적합. MVP 전략:

- 옵션 A: **ISO-3166 alpha-2 select + 검색** (신규 `select` kind 렌더러 필요)
- 옵션 B: **텍스트 입력 + enum 검증** (country 상용화된 TOP-50 목록으로 제한)
- 옵션 C: **v0.2 연기** — MVP는 country 편집 불가, 온보딩 때 AI extract한 값만 유지

**본 설계 v1.0 은 옵션 C (v0.2 연기)** 를 채택한다. 근거:
- MVP 범위 절감
- `country` 는 AI extract 정확도 낮지만 변경 빈도 극히 낮음 (사용자 본국)
- `/gstack-plan-eng-review` 에서 재검토 여지

이 경우 범위는 실질 **6 필드** (skin_types, skin_concerns, hair_type, hair_concerns, budget_level, age_range) 로 축소. §6 Registry 및 §7 DB 설계는 6 필드 기준.

---

## §6. Field Registry Pattern

### 6.1 동기

사용자 요구: "**필드가 늘어나면 (예: skin type 값 추가/수정/삭제) 하드 코딩이 아닌 단일 수정으로 반영**". 기존 SSOT 인프라 (`PROFILE_FIELD_SPEC` + `SKIN_TYPES` + i18n `{field}_{value}` 패턴) 를 활용하여 data-driven form 구현.

### 6.2 정의

**위치**: `src/client/features/profile/edit-fields-registry.ts` (v1.1 F3 근거 명시)
- client 전용 UI 메타데이터 (section 라벨, option label i18n prefix). 서버는 registry 대신 직접 zod schema + SSOT 상수 사용.
- L-10 준수 (client → shared OK). shared/ 로 올리지 않는 이유: UI 레이아웃 정보는 client 에만 필요.

```typescript
// src/client/features/profile/edit-fields-registry.ts
import "client-only";

import {
  SKIN_TYPES, SKIN_CONCERNS, HAIR_TYPES, HAIR_CONCERNS,
  BUDGET_LEVELS, AGE_RANGES,
} from "@/shared/constants/beauty";
import { PROFILE_FIELD_SPEC, JOURNEY_FIELD_SPEC }
  from "@/shared/constants/profile-field-spec";

export type EditableFieldDef = {
  key: string;                        // API payload key
  target: "profile" | "journey";      // 어느 테이블
  kind: "chip-multi" | "chip-single"; // 현 MVP: chip 만
  options: readonly string[];
  spec:
    | { cardinality: "scalar"; aiWritable: boolean }
    | { cardinality: "array"; aiWritable: boolean; max: number };
  sectionLabelKey: string;            // i18n "profile.*" 아래 키
  optionLabelPrefix: string;          // i18n "onboarding.*" 아래 prefix
};

export const EDITABLE_FIELDS: readonly EditableFieldDef[] = [
  { key: "skin_types",    target: "profile", kind: "chip-multi",
    options: SKIN_TYPES,          spec: PROFILE_FIELD_SPEC.skin_types,
    sectionLabelKey: "skinType",  optionLabelPrefix: "skinType_" },
  { key: "skin_concerns", target: "journey", kind: "chip-multi",
    options: SKIN_CONCERNS,       spec: JOURNEY_FIELD_SPEC.skin_concerns,
    sectionLabelKey: "skinConcerns", optionLabelPrefix: "skinConcern_" },
  { key: "hair_type",     target: "profile", kind: "chip-single",
    options: HAIR_TYPES,          spec: PROFILE_FIELD_SPEC.hair_type,
    sectionLabelKey: "hairType",  optionLabelPrefix: "hairType_" },
  { key: "hair_concerns", target: "profile", kind: "chip-multi",
    options: HAIR_CONCERNS,       spec: PROFILE_FIELD_SPEC.hair_concerns,
    sectionLabelKey: "hairConcerns", optionLabelPrefix: "hairConcern_" },
  { key: "budget_level",  target: "journey", kind: "chip-single",
    options: BUDGET_LEVELS,       spec: JOURNEY_FIELD_SPEC.budget_level,
    sectionLabelKey: "budget",    optionLabelPrefix: "budget_" },
  { key: "age_range",     target: "profile", kind: "chip-single",
    options: AGE_RANGES,          spec: PROFILE_FIELD_SPEC.age_range,
    sectionLabelKey: "age",       optionLabelPrefix: "ageRange_" },
] as const;
```

### 6.3 SSOT 매트릭스

| 변경 시나리오 | 편집 폼 컴포넌트 변경 | 총 수정 파일 |
|---|---|---|
| Cooldown 기간 30 → 14일 | 0 | 2 (migration + TS 상수) |
| enum 값 추가 ("mature") | 0 | 4 (beauty.ts + domain.ts + migration + i18n × 2) |
| max 변경 (3 → 5) | 0 | 2 (field-spec + migration) |
| 새 필드 추가 (e.g., allergies) | 0 (Registry 1항목) | 7 |
| 필드 삭제 | 0 | 5 |
| 새 kind 추가 (slider, date) | 1 (FieldSection 렌더러 분기) | 2 |

### 6.4 FieldSection 렌더러

```tsx
// src/client/features/profile/FieldSection.tsx
function FieldSection({ def, value, onChange }: ...) {
  const tOnb = useTranslations("onboarding");
  const tProfile = useTranslations("profile");

  const options = def.options.map((v) => ({
    value: v,
    label: tOnb(`${def.optionLabelPrefix}${v}`),
  }));

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {tProfile(def.sectionLabelKey)}
        {def.spec.cardinality === "array" && (
          <span className="text-muted-foreground/70">
            {" "}({Array.isArray(value) ? value.length : 0}/{def.spec.max})
          </span>
        )}
      </p>
      <OptionGroup
        options={options}
        value={value}
        onChange={onChange}
        mode={def.kind === "chip-multi" ? "multiple" : "single"}
        max={def.spec.cardinality === "array" ? def.spec.max : undefined}
      />
    </div>
  );
}
```

OnboardingChips 와 **코드 중복 없음** (G-2): OptionGroup primitive 재사용, SKIN_TYPES 등 상수 재사용.

---

## §7. API + DB 설계

### 7.1 신규 엔드포인트

**`PUT /api/profile/edit`**

Request body (zod):
```typescript
// v1.1 EC-3 semantic 명시:
//   undefined (필드 미포함) = "변경 없음" (server 가 무시)
//   null = "필드 초기화" (nullable 필드만, scalar 에 해당, SET NULL)
//   값 = "SET 값"
//   빈 배열 [] = 배열 삭제 (skin_types 는 .min(1) 로 금지 — 최소 1개 유지 정책)
const profileEditSchema = z.object({
  profile: z.object({
    skin_types: z.array(z.enum(SKIN_TYPES)).min(1).max(3).optional(),
    // skin_types 는 nullable 아님 — 완전 해제 불가 (온보딩 min 1 정책 유지, 'normal' fallback)
    hair_type: z.enum(HAIR_TYPES).nullable().optional(),
    hair_concerns: z.array(z.enum(HAIR_CONCERNS)).max(6).optional(),
    age_range: z.enum(AGE_RANGES).nullable().optional(),
  }).strict(),  // language 등 미지정 key 거부
  journey: z.object({
    skin_concerns: z.array(z.enum(SKIN_CONCERNS)).max(5).optional(),
    budget_level: z.enum(BUDGET_LEVELS).nullable().optional(),
  }).strict(),
}).refine((v) => 
  Object.keys(v.profile).length > 0 || Object.keys(v.journey).length > 0,
  { message: "At least one field required" }
);
```

Response 200:
```typescript
{
  data: {
    applied_profile: string[];  // 실제 변경된 profile 필드
    applied_journey: string[];  // 실제 변경된 journey 필드
  },
  meta: { timestamp: string }
}
```

Response 400/401/404/500: 표준 에러 포맷 (기존 패턴 연속).

### 7.2 새 RPC — `apply_user_explicit_edit`

**Migration 019** (예상 파일명: `019_new17d_user_explicit_edit.sql`):

```sql
BEGIN;

-- Step 1. 사전 검증 (기존 data가 신규 컬럼 추가로 깨지지 않는지)
-- (timestamp 컬럼은 모두 NULLable + default NULL 이므로 불필요)

-- Step 2. user_profiles: AI-writable 필드 × user_updated_at 컬럼 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS skin_types_user_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS age_range_user_updated_at  timestamptz NULL;

-- hair_type, hair_concerns 는 aiWritable=false 이므로 cooldown 컬럼 불필요
--   (사용자 편집으로만 set, AI 쓰기 없음. 그러나 REPLACE semantic 대응 위해 추가 여부 §7.4 에서 논의)

-- Step 3. journeys: AI-writable 필드 × user_updated_at
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS skin_concerns_user_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS budget_level_user_updated_at  timestamptz NULL;

-- Step 4. Cooldown SSOT
CREATE OR REPLACE FUNCTION get_user_edit_cooldown() RETURNS interval
  LANGUAGE sql IMMUTABLE AS $$ SELECT INTERVAL '30 days' $$;

REVOKE ALL ON FUNCTION get_user_edit_cooldown() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_edit_cooldown() TO authenticated, service_role;
-- authenticated 포함: SECURITY INVOKER 로 apply_user_explicit_edit 가 호출 시 필요

-- Step 5. 새 RPC — 사용자 명시 편집 (REPLACE semantic)
CREATE OR REPLACE FUNCTION apply_user_explicit_edit(
  p_user_id      uuid,
  p_profile_patch jsonb,  -- { skin_types: [...], hair_type: "...", ... }
  p_journey_patch jsonb   -- { skin_concerns: [...], budget_level: "..." }
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp  -- NEW-17h defense-in-depth 선반영
AS $$
DECLARE
  v_journey_id uuid;
  v_applied_profile text[] := ARRAY[]::text[];
  v_applied_journey text[] := ARRAY[]::text[];
  v_field text;
  v_value jsonb;
BEGIN
  -- D3 방어: user_profiles row 존재 확인
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_profiles row not found for user_id %', p_user_id;
  END IF;

  -- Journey lazy-create (apply_ai_journey_patch 패턴 연속)
  IF p_journey_patch <> '{}'::jsonb THEN
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
  END IF;

  -- Profile REPLACE — v1.1 DC-1 보안 수정: spec 을 whitelist 로 iterate (patch keys 아님)
  -- 이유: authenticated 가 RPC 직접 호출 시 임의 key 주입 차단 (defense-in-depth)
  --   pseudocode (실제 구현은 writing-plans 단계):
  --   FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(get_profile_field_spec()) LOOP
  --     v_inc := p_profile_patch->v_field;
  --     IF v_inc IS NULL OR v_inc = 'null'::jsonb THEN CONTINUE; END IF;   -- 필드 unset or 미전달
  --     1. 현재 값 SELECT (IS DISTINCT FROM 가드용)
  --     2. jsonb_populate_record 로 JSON → 컬럼 타입 캐스트
  --     3. IF new IS DISTINCT FROM cur THEN
  --          EXECUTE format('UPDATE user_profiles SET %I = $1, updated_at = now() WHERE user_id = $2', v_field)
  --        END IF;
  --     4. IF (v_fspec->>'aiWritable')::boolean THEN
  --          -- v1.1 CI-1 수정: 컬럼명은 concat 후 %I 로 quote
  --          EXECUTE format('UPDATE user_profiles SET %I = now() WHERE user_id = $1',
  --                         v_field || '_user_updated_at')
  --        END IF;
  --     5. GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN applied 추가
  --   END LOOP;
  FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(get_profile_field_spec()) LOOP
    -- 상기 단계 적용
    v_applied_profile := array_append(v_applied_profile, v_field);  -- 실제로는 변경 시만
  END LOOP;

  -- Journey REPLACE (profile 과 동일 패턴, get_journey_field_spec() 기반)
  IF v_journey_id IS NOT NULL THEN
    FOR v_field, v_fspec IN SELECT key, value FROM jsonb_each(get_journey_field_spec()) LOOP
      -- 상기 단계 적용
      v_applied_journey := array_append(v_applied_journey, v_field);
    END LOOP;
  END IF;

  -- beauty_summary stale 방어 (I-3) — v1.1 CI-4 Q-12 멱등성 보강
  IF (v_applied_profile <> ARRAY[]::text[] OR v_applied_journey <> ARRAY[]::text[]) THEN
    UPDATE user_profiles
       SET beauty_summary = NULL, updated_at = now()
     WHERE user_id = p_user_id
       AND beauty_summary IS NOT NULL;  -- 이미 NULL이면 skip (멱등)
  END IF;

  RETURN jsonb_build_object(
    'applied_profile', v_applied_profile,
    'applied_journey', v_applied_journey
  );
END;
$$;

-- v1.1 EC-4 수정: service_role GRANT 제거. authenticated + RLS 만으로 충분.
-- 서버 실수 (잘못된 user_id 전달) 로 타인 프로필 덮어쓸 위험 제거.
REVOKE ALL ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION apply_user_explicit_edit IS
  'NEW-17d: 사용자 명시 편집 REPLACE semantic. PL/pgSQL 단일 트랜잭션으로 profile+journey 원자 업데이트. user_updated_at 설정으로 AI patch cooldown 트리거.';

-- Step 6. apply_ai_profile_patch / apply_ai_journey_patch 개정
-- 각 필드 loop 내부에 cooldown 체크 추가:
--   v_user_ts 조회 → IF v_user_ts IS NOT NULL AND v_user_ts > now() - get_user_edit_cooldown() THEN CONTINUE;
-- (기존 M1 + CR-1 merge 로직 유지)

-- 시그니처 불변 (2-arg, NEW-17b 와 동일): (p_user_id uuid, p_patch jsonb)
-- 변경: 각 필드 loop 안에 cooldown 체크 추가 (§9.1 참조)
-- 기존 M1 + CR-1 merge 로직 전부 유지
CREATE OR REPLACE FUNCTION apply_ai_profile_patch(p_user_id uuid, p_patch jsonb)
  RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = public, pg_temp  -- NEW-17h defense-in-depth 병행
  AS $$ ... -- cooldown 체크 포함 개정, 상세는 writing-plans 단계
  $$;
CREATE OR REPLACE FUNCTION apply_ai_journey_patch(p_user_id uuid, p_patch jsonb)
  RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $$ ... -- cooldown 체크 포함 개정
  $$;

COMMIT;
```

### 7.3 Route Handler (thin)

```typescript
// src/server/features/api/routes/profile.ts (확장)
app.openapi(putProfileEditRoute, async (c) => {
  const user = c.get('user')!;
  const client = c.get('client') as DbClient;  // authenticated client
  const body = c.req.valid('json');

  try {
    const result = await applyUserExplicitEdit(
      client, user.id, body.profile, body.journey
    );
    return c.json({ data: result, meta: { timestamp: new Date().toISOString() } }, 200);
  } catch (error) {
    console.error('[PUT /api/profile/edit] failed', String(error));
    return c.json({
      error: {
        code: 'PROFILE_EDIT_FAILED',
        message: 'Failed to save profile edits',
        details: null,
      },
    }, 500);
  }
});
```

### 7.4 미결정 — `hair_type`, `hair_concerns` cooldown 컬럼

이 두 필드는 `aiWritable: false` 이므로 AI 경로로 변경되지 않는다. 따라서 **cooldown 컬럼 불필요** (`{field}_user_updated_at` 컬럼 없음). 편집 시 REPLACE 만 수행.

단, 미래에 `aiWritable` 이 `true` 로 변경되면 migration 으로 컬럼 추가 필요. 설계 문서에 명시하여 유지보수성 확보.

---

## §8. 트랜잭션 / 원자성 (J-3)

### 8.0 Save Flow — End-to-End (v1.1 F2)

```
┌──────────────────────┐
│ ProfileEditClient    │  React form state → handleSave 클릭
│ (client)             │
└──────────┬───────────┘
           │ fetch PUT /api/profile/edit
           │ body: { profile: {...}, journey: {...} }
           ▼
┌──────────────────────┐
│ Hono route handler   │  1. auth middleware → user.id
│ (server)             │  2. zod .strict() + .refine() 검증
│                      │  3. c.get('client') = authenticated SBC
└──────────┬───────────┘  (RLS 활성)
           │ service.applyUserExplicitEdit(client, user.id, ...)
           ▼
┌──────────────────────┐
│ service.ts           │  thin wrapper
│ applyUserExplicitEdit│  client.rpc('apply_user_explicit_edit', ...)
└──────────┬───────────┘
           │ RPC call (SECURITY INVOKER, authenticated 권한)
           ▼
┌──────────────────────────────────────────────────────────────┐
│ apply_user_explicit_edit(uuid, jsonb, jsonb) — PL/pgSQL       │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ BEGIN (암묵 transaction)                                 │  │
│ │                                                           │  │
│ │ 1. user_profiles EXISTS 선체크 (RLS 통과 시 true)        │  │
│ │    └─ false → EXCEPTION 'not found' → ROLLBACK          │  │
│ │                                                           │  │
│ │ 2. p_journey_patch 비었으면 스킵, 아니면:                │  │
│ │    SELECT active journey id                              │  │
│ │    없으면 INSERT (ON CONFLICT ... DO NOTHING)            │  │
│ │                                                           │  │
│ │ 3. Profile REPLACE — whitelist iterate (v1.1 DC-1)       │  │
│ │    FOR field IN get_profile_field_spec() LOOP            │  │
│ │      - patch 에 키 있으면 value 추출, 없으면 CONTINUE    │  │
│ │      - IS DISTINCT FROM 체크 → UPDATE (row lock)         │  │
│ │      - IF aiWritable THEN SET {field}_user_updated_at    │  │
│ │    END LOOP                                              │  │
│ │                                                           │  │
│ │ 4. Journey REPLACE — 동일 패턴 (get_journey_field_spec)  │  │
│ │                                                           │  │
│ │ 5. beauty_summary NULL 재설정 (적용 있고 기존 NOT NULL)  │  │
│ │                                                           │  │
│ │ COMMIT (임의 단계 실패 시 자동 ROLLBACK)                  │  │
│ └─────────────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────────┘
                          │ {applied_profile: [...], applied_journey: [...]}
                          ▼
                    ┌──────────┐
                    │ 200 OK   │  client 가 /profile redirect
                    └──────────┘
```

### 8.0a AI Patch Flow — Cooldown 상호작용 (v1.1 F2)

```
Chat afterWork → extract_user_profile tool 결과 → applyAiExtraction
    ↓
apply_ai_profile_patch(user_id, patch)  [service_role 권한]
    ↓
FOR field, fspec IN get_profile_field_spec() LOOP
    ↓
    IF NOT aiWritable THEN CONTINUE  ← NEW-17 기존
    ↓
    IF patch.{field} IS NULL THEN CONTINUE  ← NEW-17 기존
    ↓
    ─────────── v1.1 CI-5 신규 ───────────
    SELECT {field}_user_updated_at 
      FROM user_profiles WHERE user_id = ?
    IF ts IS NOT NULL AND ts > now() - 30 days:
        CONTINUE  ← 사용자 최근 편집 → AI 스킵
    ─────────────────────────────────────
    ↓
    (NEW-17 기존 M1 + CR-1 merge)
    ↓
    IF new IS DISTINCT FROM cur THEN
        UPDATE user_profiles SET {field} = new
END LOOP
```



### 8.1 검토한 대안

- **J-1 Client Orchestration**: 2 API 호출 — Q-11 직접 위반 (부분 성공 가능). **탈락**.
- **J-2 Handler Orchestration**: 보상 트랜잭션 — snapshot race + 보상 실패 취약성. **탈락**.
- **J-3 DB Atomic RPC**: PL/pgSQL 단일 트랜잭션 → 진정한 ACID. **채택**.

### 8.2 원자성 검증 (Q-11)

| # | 시나리오 | 동작 | 증거 |
|---|---|---|---|
| A1 | profile + journey 정상 저장 | 두 UPDATE 성공 → COMMIT | PL/pgSQL 함수 완료 |
| A2 | profile 성공 + journey CHECK 위반 | EXCEPTION → 자동 ROLLBACK | PostgreSQL 트랜잭션 semantic |
| A3 | journey lazy-create 실패 | INSERT 포함 전체 ROLLBACK | 함수 내 일관 |
| A4 | user_profiles row 미존재 | 선체크 EXCEPTION | §7.2 Step 5 |
| A5 | 네트워크 단절 (client ↔ server) | 서버 미실행 | 클라이언트 에러 처리 |
| A6 | server ↔ DB 단절 중 RPC | auto ROLLBACK (WAL) | ACID |
| A7 | DB crash 중 트랜잭션 | auto ROLLBACK (recovery) | ACID |

### 8.3 멱등성 (Q-12)

- 동일 편집 재시도 → `IS DISTINCT FROM` 가드로 no-op (변경 없는 UPDATE 는 applied 배열에서 제외)
- `{field}_user_updated_at` 는 매 호출마다 갱신되지만 값 자체는 last-write-wins

---

## §9. AI 우선순위 — P-3 Time-Decay Lock

### 9.1 메커니즘

각 AI-writable 필드에 `{field}_user_updated_at timestamptz NULL` 컬럼 추가. 사용자 편집 시 `apply_user_explicit_edit` 가 `now()` SET. AI patch RPC 개정:

```sql
-- apply_ai_profile_patch / apply_ai_journey_patch 각 필드 loop 안
-- ⚠️ 순서 중요: aiWritable skip 체크 → cooldown 체크 → merge
--    aiWritable=false 필드에는 {field}_user_updated_at 컬럼이 없으므로
--    cooldown 체크 전에 반드시 skip 해야 column-not-exist 오류 방지 (v1.1 CI-5)

IF NOT (v_fspec->>'aiWritable')::boolean THEN CONTINUE; END IF;  -- 기존

-- v1.1 CI-1 수정: identifier 연결 후 %I 로 quote
EXECUTE format(
  'SELECT %I FROM user_profiles WHERE user_id = $1',
  v_field || '_user_updated_at'
) INTO v_user_ts USING p_user_id;

IF v_user_ts IS NOT NULL
   AND v_user_ts > now() - get_user_edit_cooldown() THEN
  CONTINUE;  -- 사용자 최근 편집 존중, AI patch 이 필드 스킵
END IF;

-- 기존 M1 + CR-1 merge 로직 그대로
```

### 9.2 Cooldown SSOT

**MVP (v0.1)** — 30일 하드코딩:

```sql
-- DB: IMMUTABLE 함수
CREATE OR REPLACE FUNCTION get_user_edit_cooldown() RETURNS interval
  LANGUAGE sql IMMUTABLE AS $$ SELECT INTERVAL '30 days' $$;
```

```typescript
// TS: shared 상수 (Q-16 drift guard 대상)
export const USER_EDIT_COOLDOWN_DAYS = 30 as const;
```

**변경 방법**: migration 1개 + TS 상수 1줄 → 재배포. 로컬 `npm run test:integration` 으로 T11 drift 검증.

**v0.2 (관리자 앱)** — Table-backed 전환:

```sql
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

-- 함수를 STABLE 로 변경 (관리자 업데이트 즉시 반영)
CREATE OR REPLACE FUNCTION get_user_edit_cooldown() RETURNS interval
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
      (SELECT (value->>'days')::int * INTERVAL '1 day'
       FROM app_settings WHERE key = 'user_edit_cooldown'),
      INTERVAL '30 days'
    )
  $$;
```

### 9.3 검토한 대안

| 옵션 | 설명 | 채택 사유 |
|---|---|---|
| P-1 Do Nothing | 재부활 허용 + UX 안내 | UX 예측 불가, 사용자 불신. 탈락 |
| P-2 Permanent Lock | 영구 잠금 | 장기 freshness 상실, stale 위험. 탈락 |
| **P-3 Time-Decay** ⭐ | 30일 cooldown | 의지 존중 + 자동 freshness 균형. **채택** |
| P-4 Per-Value Tracking | 원소별 source tracking | MVP 과잉 복잡도. 탈락 |

### 9.4 장기 성능 / 관측성

- cooldown 타임스탬프 업데이트는 기존 UPDATE 와 동일 비용 (단일 row, PK 조회)
- AI patch loop 내 SELECT 추가 → 필드당 1회, PK 기반 조회라 별도 인덱스 불필요
- 성능 영향 미미 예상. 구체 수치는 T9/T10 통합 테스트에서 기준 측정 후 문서화.

### 9.5 알려진 한계

- Magic number 30일: 사용자 편차 미반영 (v0.2 개인화)
- Cooldown 내 진정한 변화 무시: 사용자가 편집 후 2주 뒤 실제 피부 변화 → AI 미반영 → 사용자가 /profile/edit 재방문 필요
- Cooldown 시각화 부재: UX 힌트는 v0.2

---

## §10. 보안 모델 — 3-β (authenticated + RLS)

### 10.1 결정

`apply_user_explicit_edit` = SECURITY INVOKER + `GRANT EXECUTE TO authenticated`. RLS 정책 (`auth.uid() = user_id`) 이 자동 격리.

### 10.2 NEW-17b 보안 모델과 차이

| RPC | 권한 | 근거 |
|---|---|---|
| `apply_ai_profile_patch` / `apply_ai_journey_patch` | REVOKE authenticated + GRANT service_role | 서버 주도 (chat afterWork), NEW-17b defense-in-depth |
| **`apply_user_explicit_edit`** | GRANT authenticated (service_role 제외, v1.1 EC-4) + RLS | 사용자 주도 편집. service_role 제외로 서버 실수 시 타인 프로필 파기 위험 제거 |
| `get_user_edit_cooldown` | GRANT authenticated + service_role | apply_user_explicit_edit 및 apply_ai_*_patch 양쪽 내부 호출 필요 |
| `get_profile_field_spec` / `get_journey_field_spec` | GRANT authenticated + service_role (v1.1 DC-1) | AI patch (service_role) + user_explicit whitelist 검증 (authenticated) 양쪽 사용 |

### 10.3 CHECK + zod 2중 방어

- **DB CHECK** (migration 017): `user_profiles_skin_types_values` / `user_profiles_age_range_values` / `journeys_budget_level_values` / `user_profiles_skin_types_max_3`
- **zod** (route handler): `z.enum(...)` + `.max(N)` + `.strict()` (알려지지 않은 key 거부)

### 10.4 RLS 시나리오

| 공격 | 차단 지점 |
|---|---|
| User A 가 User B 의 user_id 로 RPC 호출 | RLS 정책 — UPDATE 0 rows |
| User A 가 타 테이블 write 시도 | zod `.strict()` 에서 400 |
| enum 값 위조 | zod + CHECK 2중 차단 |
| max 초과 | zod + CHECK 2중 차단 |

---

## §11. beauty_summary 재생성 전략

### 11.1 문제

`user_profiles.beauty_summary` = "AI 생성 뷰티 프로필 요약 (2-3문장)". 편집 후 stale.

### 11.2 결정 — Option 1: NULL 재설정

`apply_user_explicit_edit` 내부에서 `UPDATE user_profiles SET beauty_summary = NULL` (변경 발생 시만).

### 11.3 후속 흐름

- 다음 채팅 세션에서 chat handler 가 `beauty_summary IS NULL` 감지 → LLM 재생성 → DB 저장 (기존 흐름)
- Q-15 비동기 쓰기 격리: 사용자는 편집 완료 즉시 200 응답. summary 생성은 다음 채팅에서 자연 처리.

### 11.4 검토한 대안

- **Option 2 즉시 LLM 호출**: 편집 직후 비동기로 LLM API 호출하여 summary 생성. **탈락** (사용자 편집 응답 지연 불가, Q-15 격리 복잡).
- **Option 3 stale 허용**: beauty_summary 를 변경 없이 유지. **탈락** (구 skin_types 기준 요약이 추천에 영향).

---

## §12. ProfileClient "Edit" 버튼 추가

### 12.1 현재 상태

```tsx
// src/client/features/profile/ProfileClient.tsx (L:91~98)
<div className="mt-6">
  <Link href={`/${locale}/chat`} className={buttonVariants({ size: "cta", className: "w-full" })}>
    {t("continue")}
  </Link>
</div>
```

### 12.2 변경

```tsx
<div className="mt-6 flex flex-col gap-2">
  <Link href={`/${locale}/chat`}
        className={buttonVariants({ size: "cta", className: "w-full" })}>
    {t("continue")}   {/* 기존: "Show my picks" */}
  </Link>
  <Link href={`/${locale}/profile/edit`}
        className={buttonVariants({ size: "cta", variant: "outline", className: "w-full" })}>
    {t("edit")}       {/* 신규 */}
  </Link>
</div>
```

### 12.3 i18n 키 추가

| 키 | en | ko |
|---|---|---|
| `profile.edit` | Edit profile | 프로필 수정 |
| `profile.save` | Save | 저장 |
| `profile.cancel` | Cancel | 취소 |
| `profile.editTitle` | Edit your profile | 프로필 수정 |
| `profile.unsavedChanges` | You have unsaved changes. Leave anyway? | 저장되지 않은 변경 사항이 있습니다. 이동할까요? |
| `profile.saveError` | Failed to save. Try again. | 저장 실패. 다시 시도하세요. |

---

## §13. 엣지 케이스 처리 일괄 정리

| ID | 이슈 | 해결 |
|---|---|---|
| I-1 | AI 재부활 | P-3 Time-Decay Lock (§9) |
| I-2 | user_profiles row 미존재 | RPC 선체크 EXCEPTION (§7.2 Step 5) |
| I-3 | beauty_summary stale | NULL 재설정 (§11) |
| I-4 | language 필드 편집 | zod `.strict()` + Registry 에서 배제 (§5.2) |
| I-5 | 배열 빈 상태 | skin_types `.min(1)`, 나머지 배열 0 허용 |
| I-6 | 동시 탭 편집 | last-write-wins (MVP), optimistic locking v0.2 |
| I-7 | 보안 모델 | 3-β authenticated + RLS (§10) |

---

## §14. 테스트 전략

### 14.1 Unit Tests

- `edit-fields-registry.ts`: 각 필드 매핑 정합성 (options ↔ SSOT)
- `FieldSection.test.tsx`: kind 별 렌더 (chip-multi, chip-single)
- `ProfileEditClient.test.tsx`: 폼 state 관리 + submit flow
- `service.ts`: `applyUserExplicitEdit` unit (mock RPC)

### 14.2 Integration Tests (`rpc-hardening.integration.test.ts` 확장)

NEW-17b T1~T8 유지 + T9~T15 추가:

- **T9 cooldown 내 AI patch 스킵**:
  - Setup: user 편집으로 `skin_types_user_updated_at = now()` SET
  - Exec: `apply_ai_profile_patch({skin_types: ['oily']})` 호출
  - Assert: `skin_types` 배열에 'oily' 재부활 없음, applied 에 skin_types 미포함
- **T10 cooldown 만료 후 재활성**:
  - Setup: `skin_types_user_updated_at` 를 `now() - INTERVAL '31 days'` 로 직접 조작
  - Exec: AI patch
  - Assert: merge 정상 수행, applied 에 skin_types 포함
- **T11 P-3 drift guard**:
  - Assert: TS `USER_EDIT_COOLDOWN_DAYS * 86400` 초 = DB `EXTRACT(EPOCH FROM get_user_edit_cooldown())`
  - 실패 시 "drift detected" 메시지
- **T12 REPLACE semantic 축소**:
  - Setup: `skin_types = ['oily','sensitive']`
  - Exec: `apply_user_explicit_edit(profile: {skin_types: ['dry']})`
  - Assert: `skin_types = ['dry']` (축소됨, merge 아님)
- **T13 beauty_summary NULL 재설정**:
  - Setup: `beauty_summary = 'some summary'`
  - Exec: 임의 필드 편집
  - Assert: `beauty_summary IS NULL`
  - Edge: 빈 patch 재호출 시 summary 건드리지 않음
- **T14 Q-11 atomic rollback**:
  - Exec: profile 정상 + journey `budget_level = 'INVALID'` (CHECK 위반)
  - Assert: EXCEPTION + profile 도 ROLLBACK (변경 없음)
- **T15 동시성 row lock (v1.1 EC-1 보강)**:
  - Parallel: AI patch + user edit 동시 호출
  - Mechanism: PostgreSQL default READ COMMITTED isolation + UPDATE 시 row-level lock (FOR UPDATE 명시 불필요 — UPDATE 문 자체가 exclusive lock)
  - Exec: `pg_sleep(0.05)` + dual transaction dispatch 로 순서 생성
  - Assert: 최종 상태가 user 값 우선
    - Case A (user 먼저 lock): user REPLACE → user_updated_at SET → AI patch cooldown 트리거 → AI skip
    - Case B (AI 먼저 lock): AI merge → user REPLACE overwrite
    - 양쪽 케이스 모두 user 값 최종 보존 검증

**v1.1 `/gstack-plan-eng-review` 추가 요구 (T16~T18, T22~T26):**

- **T16 Q-12 멱등성**: 동일 patch 두 번 연속 호출 → 첫 번째 applied 비어있지 않음, 두 번째 applied=[], DB 상태 동일, updated_at 변동 없음 (beauty_summary IS NOT NULL 가드 덕에)
- **T17 cross-user 격리**: User A 의 authenticated client 로 `apply_user_explicit_edit(p_user_id=B, ...)` 호출 → RLS + 선체크로 EXCEPTION or 0 rows. User B 프로필 무변경 검증
- **T18 zod .strict() 거부**: route handler 에서 `{profile: {language: 'ko'}}` 또는 `{profile: {unknown_field: 'x'}}` payload → 400 ZOD_ERROR
- **T22 zod .refine() 빈 payload**: `{profile: {}, journey: {}}` → 400 "At least one field required"
- **T23 error code 매핑**: user_profiles row 강제 삭제 후 (또는 mock RPC EXCEPTION) `PUT /api/profile/edit` 호출 → 404 PROFILE_NOT_FOUND (기타 에러는 500 PROFILE_EDIT_FAILED)
- **T24 E2E happy path** (Playwright): 로그인 → `/profile` → Edit 버튼 → `/profile/edit` → skin_types 변경 → Save → `/profile` redirect → ProfileCard 에 새 값 표시
- **T25 E2E dirty cancel**: `/profile/edit` → 값 변경 → Cancel 클릭 → AlertDialog → 취소 → 폼 유지. 다시 Cancel → 확인 → `/profile`
- **T26 E2E beforeunload**: `/profile/edit` → 값 변경 → 탭 닫기 시도 → 브라우저 기본 경고 발동 (window.onbeforeunload)

### 14.3 E2E Tests (Playwright)

- `/profile` → Edit 버튼 클릭 → `/profile/edit` 이동
- 7 필드 편집 → Save → `/profile` 로 redirect + 변경 반영 확인
- 필드 검증 (빈 skin_types 시 disabled Save)

---

## §15. 운영 런북

1. 로컬 `npm run test:integration` T1~T15 통과 확인
2. Supabase Dashboard SQL Editor 에서 `019_new17d_user_explicit_edit.sql` 수동 적용
3. 적용 후 검증 쿼리:
   ```sql
   SELECT proname, pronargs FROM pg_proc
    WHERE proname IN (
      'apply_user_explicit_edit',
      'get_user_edit_cooldown',
      'apply_ai_profile_patch',
      'apply_ai_journey_patch'
    );
   -- 예상: 4 rows
   
   SELECT column_name FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name LIKE '%_user_updated_at';
   -- 예상: skin_types_user_updated_at, age_range_user_updated_at
   ```
4. Vercel preview deploy → QA:
   - `/profile/edit` 정상 로드
   - 편집 → Save → `/profile` 반영
   - 편집 후 채팅에서 AI extract 시 skin_types 재부활 안 되는지 확인
5. main 머지 → prod 자동 배포
6. 24~72h 관측 (NEW-17d 특화 이슈 — edit flow, cooldown, beauty_summary 재생성)

(주: migration 016 (skin_type 구 컬럼 DROP) 은 NEW-17a scope 에 속하며 NEW-17d 와 독립. 별도 타임라인으로 관리)

---

## §16. Rollback 계획

**파일**: `supabase/migrations/019_new17d_user_explicit_edit_rollback.sql` (필수)

- `DROP FUNCTION apply_user_explicit_edit(uuid, jsonb, jsonb)`
- `DROP FUNCTION get_user_edit_cooldown()` (authenticated GRANT 제거)
- `ALTER TABLE user_profiles DROP COLUMN skin_types_user_updated_at, age_range_user_updated_at` (2개)
- `ALTER TABLE journeys DROP COLUMN skin_concerns_user_updated_at, budget_level_user_updated_at` (2개)
- `apply_ai_profile_patch` / `apply_ai_journey_patch` 를 migration 017 상태로 복원 (cooldown 체크 제거)

**Rollback 순서 (v1.1 EC-6 명시)**:
1. Vercel 이전 배포로 코드 revert (client + server)
2. Migration 019 rollback SQL 적용:
   - `DROP FUNCTION apply_user_explicit_edit` 먼저
   - `DROP FUNCTION get_user_edit_cooldown`
   - `ALTER TABLE DROP COLUMN` (4개 컬럼)
   - `apply_ai_*_patch` CREATE OR REPLACE (017 내용으로 복원, cooldown 제거)
   - 주: `SET search_path` 는 017 v1.2 에 없음. 만약 NEW-17h 가 017b 로 search_path 만 추가했다면 rollback 은 017b 상태 기준 (search_path 유지, cooldown 만 제거)
3. 검증: `SELECT proname, pronargs FROM pg_proc WHERE proname IN (...)` 로 상태 확인

**코드 revert 와 동시 적용 필수**. rollback 순서:
1. 코드 revert (Vercel 이전 배포로 rollback)
2. Migration 019 rollback SQL 적용
3. 검증

---

## §17. 아키텍처 규칙 준수 체크리스트

| 규칙 | 상태 | 근거 |
|---|---|---|
| P-1 4계층 DAG | ✅ | app/ → server/, client/ → shared/ |
| P-3 Last Leaf | ✅ | /profile/edit 제거 시 core/ 무영향 |
| P-4 Composition Root | ✅ | route handler 에서 profile + journey 조합 |
| P-7 단일 변경점 | ✅ | Field Registry + SSOT. 신규 기능 통합 구현이라 15 파일 영향이지만 브레인스토밍 Q2 Step 0 scope 검토에서 정당화됨. 차후 **값 추가/수정/삭제는 1~2 파일** (§6.3 매트릭스). v1.1 EC-7 근거 |
| P-10 제거 안전성 | ✅ | rollback migration 제공 |
| L-1 thin handler | ✅ | zod → RPC → 응답 |
| L-4 core/ 불변 | ✅ | migration 은 features/ 영역 |
| L-11 상태 관리 | ✅ | react-hook-form + OptionGroup |
| Q-5 컴포넌트 ≤200줄 | ✅ | ProfileEditClient ~150줄 예상, FieldSection 분리 |
| Q-7 에러 불삼킴 | ✅ | RPC EXCEPTION → service → 500 + 로그 |
| Q-11 복합 쓰기 원자성 | ✅ | PL/pgSQL 단일 트랜잭션 |
| Q-12 멱등성 | ✅ | IS DISTINCT FROM + REPLACE |
| Q-13 FK 의존 순서 | ✅ | user → profile → journey |
| Q-14 스키마 정합성 | ✅ | CHECK + zod 일치 |
| Q-15 비동기 쓰기 격리 | ✅ | beauty_summary 다음 채팅 처리 |
| Q-16 DB-TS drift guard | ✅ | T11 테스트 + V-27 체크리스트 |
| V-1 ~ V-27 | ✅ | 구현 시 전수 점검 |

---

## §18. 오픈 이슈 / 후속 작업

### 18.1 v0.2 로 연기

- 관리자 앱: `app_settings.user_edit_cooldown` 설정 UI
- Country 필드 편집 (select kind 렌더러)
- Optimistic locking (동시 탭 편집 방어)
- Cooldown 시각화 UX 힌트
- AI writable 필드가 `hair_type`, `hair_concerns` 로 확장될 경우 cooldown 컬럼 추가

### 18.2 병행 follow-up

- **NEW-17h** (search_path + 테스트 격리): 본 설계의 신규 RPC 도 `SET search_path` 포함 — §7.2 Step 5 에 선반영
- **NEW-17f** (배포 윈도우 sync trigger): 본 작업과 독립적, 정식 런칭 전 권장
- **NEW-17g** (CI integration test): T9~T15 추가 시 로컬 실행 기준은 동일

### 18.3 미결정 (gstack-plan-eng-review 에서 확정)

- Country 필드 MVP 포함 여부 (옵션 C v0.2 연기 채택 중 — 재검토 여지)
- cooldown 기간 30일 적절성 (사용자 리서치 필요 시)
- `hair_type`, `hair_concerns` cooldown 컬럼 선반영 여부

---

## §19. 참고 문서

### 19.1 정본 (상위 우선순위)

- `docs/03-design/schema.dbml` §user_profiles, §journeys
- `docs/03-design/PRD.md` §4-A
- `docs/03-design/TDD.md` (HOW 정본)
- `CLAUDE.md` (§1~§9 코드 표준)

### 19.2 선행 설계

- `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` v1.1
- `docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` v1.2
- `docs/superpowers/specs/2026-04-16-new17b-review-state.md` (완료 핸드오프)

### 19.3 관련 migration

- `014_onboarding_completion_gate.sql` (ux_journeys_user_active 부분 유니크 인덱스)
- `015_profile_skin_types_array.sql`
- `015b_apply_ai_journey_patch.sql`
- `017_rpc_hardening.sql` v1.2 (현 RPC 정본)

### 19.4 관련 코드

- `src/client/features/chat/OnboardingChips.tsx` (UI 패턴 참조)
- `src/client/ui/primitives/option-group.tsx` (재사용 primitive)
- `src/client/features/profile/ProfileClient.tsx` (Edit 버튼 추가 대상)
- `src/server/features/profile/service.ts` (applyAiExtraction 참조)
- `src/server/features/api/routes/profile.ts` (엔드포인트 확장 대상)
- `src/shared/constants/profile-field-spec.ts` (SSOT)
- `src/shared/constants/beauty.ts` (enum 목록)

---

## §20. 변경 이력

- **v1.1 (2026-04-17)**: `/gstack-plan-eng-review` + Claude subagent outside voice 반영.
  - **CRITICAL 수정**:
    - CI-1: `EXECUTE format('SELECT %I_user_updated_at ...', v_field)` identifier 연결 버그 → `format('SELECT %I ...', v_field || '_user_updated_at')` 로 수정 (컴파일 오류 방지)
    - DC-1: RPC 내부 whitelist 보안. `jsonb_each(patch)` 로 loop 하던 코드를 `jsonb_each(get_*_field_spec())` 로 변경 (authenticated 사용자가 RPC 직접 호출 시 임의 key 주입 차단)
    - EC-4: `apply_user_explicit_edit` service_role GRANT 제거. authenticated + RLS 만으로 방어. 서버 실수 시 타인 프로필 덮어쓰기 위험 제거
    - CI-5: cooldown check 위치 명시 — aiWritable skip 체크 뒤에 수행 (column-not-exist 오류 방지)
  - **minor 수정**:
    - CI-4: beauty_summary NULL 재설정에 `AND beauty_summary IS NOT NULL` 가드 추가 (Q-12 멱등성)
    - EC-1: T15 race mechanism (READ COMMITTED + UPDATE row lock) 명시
    - EC-3: zod schema 에 null/undefined semantic 주석 추가
    - EC-5: §15 운영 런북에서 migration 016 언급 분리 (scope 오염 제거)
    - EC-6: §16 rollback 순서 구체화
    - EC-7: §17 P-7 체크리스트 근거 명시
- **v1.0 (2026-04-17)**: 브레인스토밍 세션 기반 최초 작성. Q1~Q4 확정 사항 반영. `/gstack-plan-eng-review` 대기.
