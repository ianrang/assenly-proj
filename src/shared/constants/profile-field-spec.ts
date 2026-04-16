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
