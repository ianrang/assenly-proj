import "server-only";
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
  type ProfileFieldSpec,
} from "@/shared/constants/profile-field-spec";
import type {
  UserProfileVars,
  JourneyContextVars,
} from "@/shared/types/profile";

// ============================================================
// NEW-17: 프로필 merge 규약 TS 참조 구현.
//
// 프로덕션 경로는 Postgres RPC (apply_ai_profile_patch /
// apply_ai_journey_patch) 사용. 이 파일은 (a) 단위 테스트로 규약 고정,
// (b) RPC 의미론의 TS 정본.
//
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

/**
 * 프로필 또는 journey 패치를 field-spec 규약에 따라 계산한다.
 *
 * 규약:
 *  - source='user' scalar  : 대체 (aiWritable 무관)
 *  - source='user' array   : 대체 (capped), 현재값과 동일하면 no_change
 *  - source='ai'   aiWritable=false : 전부 skip (not_ai_writable)
 *  - source='ai'   scalar existing=null : 기입
 *  - source='ai'   scalar existing!=null : skip (ai_scalar_nonempty, M1)
 *  - source='ai'   array incoming=[]    : skip (empty_incoming)
 *  - source='ai'   array                : cur ∪ inc, cap 적용,
 *                                          cur 전체 보존 + 신규만 추가 (M1)
 */
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
    const inc = (incoming as Record<string, unknown>)[field];
    if (inc === undefined) continue;

    if (source === "ai" && !fspec.aiWritable) {
      skipped.push({ field, reason: "not_ai_writable" });
      continue;
    }

    if (fspec.cardinality === "scalar") {
      if (source === "ai") {
        const cur = (existing as Record<string, unknown>)[field];
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
      // array
      const incArr = (inc as unknown as string[] | null) ?? [];
      const curArr =
        ((existing as Record<string, unknown>)[field] as
          | string[]
          | null
          | undefined) ?? [];

      if (source === "user") {
        const capped = incArr.slice(0, fspec.max);
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
//
// SG-5 spec-driven 라우팅:
//   필드명이 PROFILE_FIELD_SPEC에 있으면 profilePatch, JOURNEY_FIELD_SPEC에
//   있으면 journeyPatch로 분리. 두 레지스트리 교집합은 ∅ (테스트로 고정).
//
// AI-AI 병합 규약:
//   scalar: first non-null wins (뒤 추출이 앞 값을 덮지 않음 — RPC M3과 일관)
//   array:  union (dedup, 첫 등장 순서 유지)
// ────────────────────────────────────────────────────────────

export interface ExtractionResult {
  skin_types: string[] | null;
  skin_concerns: string[] | null;
  stay_days: number | null;
  budget_level: string | null;
  age_range: string | null;
}

export function mergeExtractionResults(results: ExtractionResult[]): {
  profilePatch: Partial<UserProfileVars>;
  journeyPatch: Partial<JourneyContextVars>;
} {
  const profileKeys = new Set(Object.keys(PROFILE_FIELD_SPEC));
  const journeyKeys = new Set(Object.keys(JOURNEY_FIELD_SPEC));

  const profileScalarSeen = new Map<string, unknown>();
  const journeyScalarSeen = new Map<string, unknown>();
  const profileArrays = new Map<string, Set<string>>();
  const journeyArrays = new Map<string, Set<string>>();

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

  for (const [k, v] of profileScalarSeen) {
    (profilePatch as Record<string, unknown>)[k] = v;
  }
  for (const [k, v] of journeyScalarSeen) {
    (journeyPatch as Record<string, unknown>)[k] = v;
  }
  for (const [k, set] of profileArrays) {
    (profilePatch as Record<string, unknown>)[k] = [...set];
  }
  for (const [k, set] of journeyArrays) {
    (journeyPatch as Record<string, unknown>)[k] = [...set];
  }

  return { profilePatch, journeyPatch };
}
