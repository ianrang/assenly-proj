// ============================================================
// P2-64c-3: clinic_treatments junction 유형 기반 자동 생성
// clinic_type → treatment categories 규칙 매핑 + hair 특수 처리
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage: npx tsx scripts/seed/generate-clinic-treatments.ts [--dry-run]
// ============================================================

import { createPipelineClient } from "./lib/utils/db-client";
import { loadJunctions } from "./lib/loader";
import { parseArgs } from "./parse-args";
import type { JunctionInput } from "./lib/loader";

// ── 매핑 규칙 (data-collection.md §2.3, §9) ────────────────

/** clinic_type → 제공 가능한 treatment categories */
const CLINIC_TYPE_CATEGORIES: Record<string, string[]> = {
  dermatology: ["laser", "skin", "facial", "injection"],
  plastic_surgery: ["injection", "body", "facial"],
};

/** hair 시술 매핑 — 클리닉명에 모발 키워드 포함 시 */
const HAIR_KEYWORDS: string[] = ["모발", "탈모", "hair"];

// ── 타입 (L-14: 스크립트 전용) ──────────────────────────────

interface ClinicRow {
  id: string;
  clinic_type: string;
  name: Record<string, string>;
}

interface TreatmentRow {
  id: string;
  category: string;
}

// ── 매핑 로직 ───────────────────────────────────────────────

function matchesHairKeywords(name: Record<string, string>): boolean {
  const ko = name.ko ?? "";
  const en = (name.en ?? "").toLowerCase();
  return HAIR_KEYWORDS.some(
    (kw) => ko.includes(kw) || en.includes(kw.toLowerCase()),
  );
}

function buildJunctions(
  clinics: ClinicRow[],
  treatments: TreatmentRow[],
): { clinic_id: string; treatment_id: string }[] {
  // treatment category별 그룹
  const byCategory = new Map<string, string[]>();
  for (const t of treatments) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t.id);
    byCategory.set(t.category, list);
  }

  const hairTreatmentIds = byCategory.get("hair") ?? [];
  const junctions: { clinic_id: string; treatment_id: string }[] = [];
  const seen = new Set<string>();

  for (const clinic of clinics) {
    // 1. clinic_type → categories 규칙 매핑
    const categories = CLINIC_TYPE_CATEGORIES[clinic.clinic_type] ?? [];
    for (const cat of categories) {
      const treatmentIds = byCategory.get(cat) ?? [];
      for (const treatmentId of treatmentIds) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          junctions.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }

    // 2. hair 특수 처리 — 모발 키워드 클리닉만
    if (matchesHairKeywords(clinic.name)) {
      for (const treatmentId of hairTreatmentIds) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          junctions.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }
  }

  return junctions;
}

// ── main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const dryRun = !!args["dry-run"];

  // 1. DB에서 clinics 조회
  const client = createPipelineClient();
  const { data: clinics, error: cErr } = await client
    .from("clinics")
    .select("id, clinic_type, name")
    .eq("status", "active");

  if (cErr || !clinics) {
    console.error("[clinic-treatments] clinics 조회 실패:", cErr?.message);
    process.exit(1);
  }

  // 2. DB에서 treatments 조회
  const { data: treatments, error: tErr } = await client
    .from("treatments")
    .select("id, category");

  if (tErr || !treatments) {
    console.error("[clinic-treatments] treatments 조회 실패:", tErr?.message);
    process.exit(1);
  }

  console.log(`[clinic-treatments] clinics: ${clinics.length}`);
  console.log(`[clinic-treatments] treatments: ${treatments.length}`);

  // 3. junction 생성
  const junctionData = buildJunctions(
    clinics as ClinicRow[],
    treatments as TreatmentRow[],
  );
  console.log(`[clinic-treatments] generated: ${junctionData.length} junctions`);

  // 4. 통계
  const stats: Record<string, number> = {};
  for (const clinic of clinics as ClinicRow[]) {
    const count = junctionData.filter((j) => j.clinic_id === clinic.id).length;
    stats[clinic.clinic_type] = (stats[clinic.clinic_type] ?? 0) + count;
  }
  console.log(`[clinic-treatments] clinic_type별:`, JSON.stringify(stats));

  // hair 매칭 통계
  const hairClinics = (clinics as ClinicRow[]).filter((c) =>
    matchesHairKeywords(c.name),
  );
  console.log(`[clinic-treatments] hair 키워드 클리닉: ${hairClinics.length}건`);

  if (dryRun) {
    console.log("[clinic-treatments] DRY RUN — DB 적재 안 함");
    return;
  }

  // 5. loadJunctions 적재
  const input: JunctionInput[] = [
    { type: "clinic_treatment", data: junctionData },
  ];
  const results = await loadJunctions(client, input);
  for (const r of results) {
    console.log(
      `  ${r.entityType}: ${r.inserted} inserted, ${r.failed} failed`,
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.warn(`    - ${e.message}`));
    }
  }
}

main().catch((err) => {
  console.error("[clinic-treatments] Fatal:", err);
  process.exit(1);
});
