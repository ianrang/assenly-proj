import 'client-only';

import {
  SKIN_TYPES, SKIN_CONCERNS, HAIR_TYPES, HAIR_CONCERNS,
  BUDGET_LEVELS, AGE_RANGES,
} from '@/shared/constants/beauty';
import type { ProfileFieldSpec } from '@/shared/constants/profile-field-spec';
import { PROFILE_FIELD_SPEC, JOURNEY_FIELD_SPEC } from '@/shared/constants/profile-field-spec';

// ============================================================
// NEW-17d: 편집 폼 필드 SSOT.
// L-10 client → shared (OK). UI 메타데이터만 담음 (section label, option prefix).
// 새 필드 추가: 항목 1개 + 상수 + migration + i18n + spec = 변경점 5~7 군데.
// 편집 폼 컴포넌트 (ProfileEditClient, FieldSection) 는 무변경.
// ============================================================

export type EditableFieldDef = {
  key: string;
  target: 'profile' | 'journey';
  kind: 'chip-multi' | 'chip-single';
  options: readonly string[];
  spec: ProfileFieldSpec;
  sectionLabelKey: string;   // i18n profile.* key
  optionLabelPrefix: string; // i18n onboarding.*_ prefix
};

export const EDITABLE_FIELDS: readonly EditableFieldDef[] = [
  {
    key: 'skin_types',
    target: 'profile',
    kind: 'chip-multi',
    options: SKIN_TYPES,
    spec: PROFILE_FIELD_SPEC.skin_types,
    sectionLabelKey: 'skinType',
    optionLabelPrefix: 'skinType_',
  },
  {
    key: 'skin_concerns',
    target: 'journey',
    kind: 'chip-multi',
    options: SKIN_CONCERNS,
    spec: JOURNEY_FIELD_SPEC.skin_concerns,
    sectionLabelKey: 'skinConcerns',
    optionLabelPrefix: 'skinConcern_',
  },
  {
    key: 'hair_type',
    target: 'profile',
    kind: 'chip-single',
    options: HAIR_TYPES,
    spec: PROFILE_FIELD_SPEC.hair_type,
    sectionLabelKey: 'hairType',
    optionLabelPrefix: 'hairType_',
  },
  {
    key: 'hair_concerns',
    target: 'profile',
    kind: 'chip-multi',
    options: HAIR_CONCERNS,
    spec: PROFILE_FIELD_SPEC.hair_concerns,
    sectionLabelKey: 'hairConcerns',
    optionLabelPrefix: 'hairConcern_',
  },
  {
    key: 'budget_level',
    target: 'journey',
    kind: 'chip-single',
    options: BUDGET_LEVELS,
    spec: JOURNEY_FIELD_SPEC.budget_level,
    sectionLabelKey: 'budget',
    optionLabelPrefix: 'budget_',
  },
  {
    key: 'age_range',
    target: 'profile',
    kind: 'chip-single',
    options: AGE_RANGES,
    spec: PROFILE_FIELD_SPEC.age_range,
    sectionLabelKey: 'age',
    optionLabelPrefix: 'ageRange_',
  },
] as const;
