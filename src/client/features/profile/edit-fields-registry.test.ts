import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { EDITABLE_FIELDS } from "./edit-fields-registry";
import {
  SKIN_TYPES,
  SKIN_CONCERNS,
  HAIR_TYPES,
  HAIR_CONCERNS,
  BUDGET_LEVELS,
  AGE_RANGES,
} from "@/shared/constants/beauty";
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from "@/shared/constants/profile-field-spec";

// ============================================================
// NEW-17d Task 21: EDITABLE_FIELDS SSOT 무결성 검증.
// - 6개 필드 (MVP scope, spec §5.1/§5.4/§5.2)
// - 각 필드가 올바른 beauty constant + spec 레지스트리를 참조
// - profile/journey 타겟 분기 (4/2)
// - kind ↔ cardinality 대응 (array→chip-multi, scalar→chip-single)
// - country/language 제외 (MVP scope 검증)
// ============================================================

describe("EDITABLE_FIELDS registry (SSOT integrity)", () => {
  it("has 6 fields (MVP scope per spec §5.1)", () => {
    expect(EDITABLE_FIELDS).toHaveLength(6);
  });

  it("each field references the corresponding SSOT constant", () => {
    const sources: Record<string, readonly string[]> = {
      skin_types: SKIN_TYPES,
      skin_concerns: SKIN_CONCERNS,
      hair_type: HAIR_TYPES,
      hair_concerns: HAIR_CONCERNS,
      budget_level: BUDGET_LEVELS,
      age_range: AGE_RANGES,
    };
    for (const def of EDITABLE_FIELDS) {
      expect(def.options).toBe(sources[def.key]);
    }
  });

  it("each field references the correct PROFILE/JOURNEY spec", () => {
    for (const def of EDITABLE_FIELDS) {
      const expectedSpec =
        def.target === "profile"
          ? (PROFILE_FIELD_SPEC as Record<string, unknown>)[def.key]
          : (JOURNEY_FIELD_SPEC as Record<string, unknown>)[def.key];
      expect(def.spec).toBe(expectedSpec);
    }
  });

  it("profile fields and journey fields split correctly", () => {
    const byTarget = EDITABLE_FIELDS.reduce(
      (acc, def) => {
        acc[def.target]++;
        return acc;
      },
      { profile: 0, journey: 0 },
    );
    expect(byTarget.profile).toBe(4); // skin_types, hair_type, hair_concerns, age_range
    expect(byTarget.journey).toBe(2); // skin_concerns, budget_level
  });

  it("array fields define max, scalar fields do not", () => {
    for (const def of EDITABLE_FIELDS) {
      if (def.spec.cardinality === "array") {
        expect(
          (def.spec as { cardinality: "array"; max: number }).max,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("kind matches cardinality (array→chip-multi or scalar→chip-single)", () => {
    for (const def of EDITABLE_FIELDS) {
      if (def.spec.cardinality === "array") {
        expect(def.kind).toBe("chip-multi");
      } else {
        expect(def.kind).toBe("chip-single");
      }
    }
  });

  it("every field has a sectionLabelKey and optionLabelPrefix", () => {
    for (const def of EDITABLE_FIELDS) {
      expect(def.sectionLabelKey).toMatch(/^[a-zA-Z]+$/);
      expect(def.optionLabelPrefix).toMatch(/^[a-zA-Z]+_$/);
    }
  });

  it("no country field (per spec §5.4 MVP scope)", () => {
    expect(EDITABLE_FIELDS.find((f) => f.key === "country")).toBeUndefined();
  });

  it("no language field (per spec §5.2 exclusion)", () => {
    expect(EDITABLE_FIELDS.find((f) => f.key === "language")).toBeUndefined();
  });
});
