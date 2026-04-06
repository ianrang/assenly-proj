// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  cleanTags,
  buildTreatmentListText,
  buildTagMappingPrompt,
  parseTagMappingResponse,
  buildClinicTreatmentJunctions,
  buildFallbackJunctions,
  type TreatmentRef,
  type ClinicTagData,
  type TagMappingResult,
} from "./clinic-treatment-mapper";

// ── Fixture ─────────────────────────────────────────────────

const TREATMENTS: TreatmentRef[] = [
  { id: "t-1", nameKo: "레이저 토닝", nameEn: "Laser Toning", category: "laser" },
  { id: "t-2", nameKo: "보톡스 이마", nameEn: "Botox Forehead", category: "injection" },
  { id: "t-3", nameKo: "보톡스 턱 (사각턱)", nameEn: "Botox for Jaw", category: "injection" },
  { id: "t-4", nameKo: "써마지 FLX", nameEn: "Thermage FLX", category: "laser" },
  { id: "t-5", nameKo: "아쿠아필", nameEn: "Aqua Peel", category: "skin" },
  { id: "t-6", nameKo: "두피 스케일링", nameEn: "Scalp Scaling", category: "hair" },
];

// ── cleanTags ───────────────────────────────────────────────

describe("cleanTags", () => {
  it("removes # prefix and filters excluded tags", () => {
    const input = ["#1차병원", "#보톡스", "#써마지리프팅", "#피부관리"];
    const result = cleanTags(input);
    expect(result).toEqual(["보톡스", "써마지리프팅", "피부관리"]);
  });

  it("returns empty array for empty input", () => {
    expect(cleanTags([])).toEqual([]);
  });

  it("handles tags without # prefix", () => {
    const result = cleanTags(["보톡스", "#필러"]);
    expect(result).toEqual(["보톡스", "필러"]);
  });
});

// ── buildTreatmentListText ──────────────────────────────────

describe("buildTreatmentListText", () => {
  it("formats treatments as numbered list", () => {
    const result = buildTreatmentListText(TREATMENTS.slice(0, 2));
    expect(result).toContain("1. 레이저 토닝 (Laser Toning) [laser]");
    expect(result).toContain("2. 보톡스 이마 (Botox Forehead) [injection]");
  });
});

// ── buildTagMappingPrompt ───────────────────────────────────

describe("buildTagMappingPrompt", () => {
  it("includes clinic info and cleaned tags", () => {
    const clinic: ClinicTagData = {
      clinicId: "c-1",
      clinicNameKo: "CNP피부과",
      clinicType: "dermatology",
      tags: ["#1차병원", "#보톡스", "#색소치료"],
    };
    const result = buildTagMappingPrompt(clinic, buildTreatmentListText(TREATMENTS));
    expect(result).toContain("CNP피부과");
    expect(result).toContain("dermatology");
    expect(result).toContain("- 보톡스");
    expect(result).toContain("- 색소치료");
    expect(result).not.toContain("1차병원");
  });
});

// ── parseTagMappingResponse ─────────────────────────────────

describe("parseTagMappingResponse", () => {
  it("parses valid JSON with treatment numbers", () => {
    const text = '{"treatment_numbers": [1, 2, 3], "unmatched_tags": ["가슴성형"]}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result).not.toBeNull();
    expect(result!.treatmentIds).toEqual(["t-1", "t-2", "t-3"]);
    expect(result!.unmatchedTags).toEqual(["가슴성형"]);
  });

  it("deduplicates treatment numbers", () => {
    const text = '{"treatment_numbers": [1, 1, 2], "unmatched_tags": []}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-1", "t-2"]);
  });

  it("ignores out-of-range numbers", () => {
    const text = '{"treatment_numbers": [0, 1, 99], "unmatched_tags": []}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-1"]);
  });

  it("extracts JSON from markdown-wrapped response", () => {
    const text = '```json\n{"treatment_numbers": [4], "unmatched_tags": []}\n```';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-4"]);
  });

  it("returns null for unparseable text", () => {
    expect(parseTagMappingResponse("no json here", TREATMENTS)).toBeNull();
  });
});

// ── buildClinicTreatmentJunctions ───────────────────────────

describe("buildClinicTreatmentJunctions", () => {
  it("converts mappings to junction rows with dedup", () => {
    const mappings: TagMappingResult[] = [
      { clinicId: "c-1", clinicNameKo: "A", treatmentIds: ["t-1", "t-2"], unmatchedTags: [] },
      { clinicId: "c-2", clinicNameKo: "B", treatmentIds: ["t-1", "t-3"], unmatchedTags: [] },
    ];
    const rows = buildClinicTreatmentJunctions(mappings);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ clinic_id: "c-1", treatment_id: "t-1" });
  });

  it("handles duplicate clinic-treatment pairs", () => {
    const mappings: TagMappingResult[] = [
      { clinicId: "c-1", clinicNameKo: "A", treatmentIds: ["t-1", "t-1"], unmatchedTags: [] },
    ];
    const rows = buildClinicTreatmentJunctions(mappings);
    expect(rows).toHaveLength(1);
  });
});

// ── buildFallbackJunctions ──────────────────────────────────

describe("buildFallbackJunctions", () => {
  it("maps dermatology clinics to correct categories", () => {
    const clinics = [{ id: "c-1", clinicType: "dermatology", nameKo: "강남피부과" }];
    const rows = buildFallbackJunctions(clinics, TREATMENTS);
    const treatmentIds = rows.map((r) => r.treatment_id);
    expect(treatmentIds).toContain("t-1"); // laser
    expect(treatmentIds).toContain("t-2"); // injection
    expect(treatmentIds).not.toContain("t-6"); // hair (no keyword match)
  });

  it("adds hair treatments for clinics with hair keywords", () => {
    const clinics = [{ id: "c-1", clinicType: "dermatology", nameKo: "탈모 전문 피부과" }];
    const rows = buildFallbackJunctions(clinics, TREATMENTS);
    const treatmentIds = rows.map((r) => r.treatment_id);
    expect(treatmentIds).toContain("t-6"); // hair
  });
});
