// ============================================================
// Clinic-Treatment Tag Mapping — 순수 함수 모듈
// 카카오맵 태그(한국어) → treatments 53건 매핑
// LLM 응답 파싱, junction 데이터 생성, fallback 규칙
// P-9: scripts/ 내부 전용. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

// ── 타입 (L-14: 모듈 전용) ──────────────────────────────────

/** 카카오맵에서 추출한 클리닉 태그 */
export interface ClinicTagData {
  clinicId: string;
  clinicNameKo: string;
  clinicType: string;
  tags: string[];
}

/** 시술 참조 데이터 */
export interface TreatmentRef {
  id: string;
  nameKo: string;
  nameEn: string;
  category: string;
}

/** 단일 클리닉 LLM 매핑 결과 */
export interface TagMappingResult {
  clinicId: string;
  clinicNameKo: string;
  treatmentIds: string[];
  unmatchedTags: string[];
}

/** DB 적재용 junction 행 */
export interface ClinicTreatmentRow {
  clinic_id: string;
  treatment_id: string;
}

// ── 상수 (G-10) ────────────────────────────────────────────

/** 제외할 비시술 태그 */
const EXCLUDED_TAG_PREFIXES = ["#1차병원", "#2차병원", "#3차병원"];

/** clinic_type → 기본 제공 treatment categories (fallback용) */
export const FALLBACK_CATEGORIES: Record<string, string[]> = {
  dermatology: ["laser", "skin", "facial", "injection"],
  plastic_surgery: ["injection", "body", "facial"],
};

/** hair 키워드 (fallback용) */
export const HAIR_KEYWORDS = ["모발", "탈모", "hair"];

// ── 태그 전처리 ─────────────────────────────────────────────

/** 태그 배열에서 '#' 접두사 제거 + 비시술 태그 필터링 */
export function cleanTags(rawTags: string[]): string[] {
  return rawTags
    .filter((tag) => !EXCLUDED_TAG_PREFIXES.some((p) => tag.startsWith(p)))
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
}

// ── 프롬프트 구성 ───────────────────────────────────────────

/** 시술 목록 → 프롬프트용 텍스트 */
export function buildTreatmentListText(treatments: TreatmentRef[]): string {
  return treatments
    .map((t, i) => `${i + 1}. ${t.nameKo} (${t.nameEn}) [${t.category}]`)
    .join("\n");
}

/** 클리닉 태그 + 시술 목록 → LLM 매핑 프롬프트 */
export function buildTagMappingPrompt(
  clinic: ClinicTagData,
  treatmentListText: string,
): string {
  const cleanedTags = cleanTags(clinic.tags);
  return `You are a Korean dermatology and plastic surgery expert.

A clinic "${clinic.clinicNameKo}" (type: ${clinic.clinicType}) has registered these service tags on Kakao Map:
${cleanedTags.map((t) => `- ${t}`).join("\n")}

From the treatment database below, identify which treatments this clinic likely offers based on their tags.

RULES:
- Match tags to treatments by meaning (e.g., "보톡스" matches all Botox variants, "색소치료" matches laser/peel treatments for pigmentation)
- A tag may match MULTIPLE treatments (e.g., "필러" → all filler types)
- A tag may match ZERO treatments if it's not in our database (e.g., "쌍꺼풀수술")
- Only include treatments you are confident this clinic offers based on the tags
- Return treatment numbers from the list, not names
- Return ONLY valid JSON, no markdown fences, no explanation

Available treatments:
${treatmentListText}

Return JSON: {"treatment_numbers": [1, 5, 12, ...], "unmatched_tags": ["tag1", "tag2"]}`;
}

// ── LLM 응답 파싱 ───────────────────────────────────────────

/** LLM JSON 응답 → treatment indices + unmatched tags */
export function parseTagMappingResponse(
  text: string,
  treatments: TreatmentRef[],
): { treatmentIds: string[]; unmatchedTags: string[] } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: { treatment_numbers?: unknown; unmatched_tags?: unknown } =
      JSON.parse(jsonMatch[0]);

    const rawNumbers = Array.isArray(parsed.treatment_numbers)
      ? parsed.treatment_numbers
      : [];
    const rawUnmatched = Array.isArray(parsed.unmatched_tags)
      ? parsed.unmatched_tags
      : [];

    // 1-based index → treatment ID 변환
    const treatmentIds = rawNumbers
      .filter(
        (n): n is number =>
          typeof n === "number" && n >= 1 && n <= treatments.length,
      )
      .map((n) => treatments[n - 1].id);

    // 중복 제거
    const uniqueIds = [...new Set(treatmentIds)];

    const unmatchedTags = rawUnmatched
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim());

    return { treatmentIds: uniqueIds, unmatchedTags };
  } catch {
    return null;
  }
}

// ── Junction 데이터 생성 ────────────────────────────────────

/** TagMappingResult[] → ClinicTreatmentRow[] (중복 방지) */
export function buildClinicTreatmentJunctions(
  mappings: TagMappingResult[],
): ClinicTreatmentRow[] {
  const rows: ClinicTreatmentRow[] = [];
  const seen = new Set<string>();

  for (const mapping of mappings) {
    for (const treatmentId of mapping.treatmentIds) {
      const key = `${mapping.clinicId}:${treatmentId}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ clinic_id: mapping.clinicId, treatment_id: treatmentId });
      }
    }
  }

  return rows;
}

// ── Fallback 규칙 기반 매핑 ─────────────────────────────────

/** 태그 없는 클리닉 → clinic_type 기반 fallback junction 생성 */
export function buildFallbackJunctions(
  clinics: Array<{ id: string; clinicType: string; nameKo: string }>,
  treatments: TreatmentRef[],
): ClinicTreatmentRow[] {
  const byCategory = new Map<string, string[]>();
  for (const t of treatments) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t.id);
    byCategory.set(t.category, list);
  }

  const hairTreatmentIds = byCategory.get("hair") ?? [];
  const rows: ClinicTreatmentRow[] = [];
  const seen = new Set<string>();

  for (const clinic of clinics) {
    const categories = FALLBACK_CATEGORIES[clinic.clinicType] ?? [];
    for (const cat of categories) {
      for (const treatmentId of byCategory.get(cat) ?? []) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }

    // hair 키워드 매칭
    if (HAIR_KEYWORDS.some((kw) => clinic.nameKo.includes(kw))) {
      for (const treatmentId of hairTreatmentIds) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }
  }

  return rows;
}
