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

/**
 * NEW-17d P-3 Time-Decay Lock cooldown (일 단위).
 * DB SSOT: `get_user_edit_cooldown()` IMMUTABLE 함수 (migration 019).
 * Drift guard: integration test T11 — `get_user_edit_cooldown_days()` ↔ 이 상수 일치 검증.
 * v0.2 admin-UI 도입 시 DB 함수는 STABLE + app_settings table-lookup 로 전환.
 */
export const USER_EDIT_COOLDOWN_DAYS = 30 as const;
