import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeProfilePatch, mergeExtractionResults } from "./merge";
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from "@/shared/constants/profile-field-spec";

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
      expect(r.skipped).toContainEqual({
        field: "hair_type",
        reason: "not_ai_writable",
      });
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
      expect(r.skipped).toContainEqual({
        field: "age_range",
        reason: "ai_scalar_nonempty",
      });
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
    it("no change → skip", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry"] },
        { skin_types: ["dry"] },
        "user",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
      expect(r.skipped).toContainEqual({ field: "skin_types", reason: "no_change" });
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
    it("cap 도달 → 사용자값 보존, AI 추가 0", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry", "sensitive", "oily"] },
        { skin_types: ["combination"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
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
      expect(r.skipped).toContainEqual({ field: "skin_types", reason: "no_change" });
    });
    it("empty incoming → skip", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry"] },
        { skin_types: [] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates).toEqual({});
      expect(r.skipped).toContainEqual({ field: "skin_types", reason: "empty_incoming" });
    });
    it("existing empty + incoming ['dry'] → ['dry']", () => {
      const r = computeProfilePatch(
        { skin_types: [] },
        { skin_types: ["dry"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      expect(r.updates.skin_types).toEqual(["dry"]);
    });
    it("partial additions at near-cap", () => {
      const r = computeProfilePatch(
        { skin_types: ["dry", "sensitive"] },
        { skin_types: ["oily", "combination"] },
        "ai",
        PROFILE_FIELD_SPEC,
      );
      // cur 2, remaining=1, one addition
      expect(r.updates.skin_types).toEqual(["dry", "sensitive", "oily"]);
    });
  });

  it("멱등 재호출 (ai)", () => {
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

  it("null skin_types 전파 skip + journey stay_days 캡처", () => {
    const r = mergeExtractionResults([
      { skin_types: null, skin_concerns: null, stay_days: 5, budget_level: null, age_range: null },
    ]);
    expect(r.profilePatch).not.toHaveProperty("skin_types");
    expect(r.journeyPatch.stay_days).toBe(5);
  });
});
