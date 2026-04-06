// ============================================================
// P2-64c-3: clinic_treatments junction — 카카오맵 태그 기반
// 태그 JSON → LLM 매핑 → D-7 검수 CSV → DELETE + UPSERT
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage:
//   npx tsx scripts/seed/generate-clinic-treatments.ts --generate [--dry-run]
//   npx tsx scripts/seed/generate-clinic-treatments.ts --load --csv=<path>
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";

import { getPipelineModel } from "./lib/enrichment/ai-client";
import { createPipelineClient } from "./lib/utils/db-client";
import { loadJunctions } from "./lib/loader";
import { parseCsvFile, stringifyCsvRows } from "./lib/utils/csv-parser";
import { parseArgs } from "./parse-args";
import type { JunctionInput } from "./lib/loader";

import {
  cleanTags,
  buildTreatmentListText,
  buildTagMappingPrompt,
  parseTagMappingResponse,
  buildClinicTreatmentJunctions,
  buildFallbackJunctions,
  type ClinicTagData,
  type TreatmentRef,
  type TagMappingResult,
  type ClinicTreatmentRow,
} from "./lib/clinic-treatment-mapper";

// ── 상수 (G-10) ────────────────────────────────────────────

/** LLM 호출 간 딜레이 (ms) — rate limit 방지 */
const CALL_DELAY_MS = 500;

const TAGS_PATH = "scripts/seed/data/clinic-tags.json";

const REVIEW_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "review-data",
);

// ── 데이터 로드 헬퍼 ────────────────────────────────────────

function loadClinicTags(): ClinicTagData[] {
  return JSON.parse(readFileSync(TAGS_PATH, "utf-8")) as ClinicTagData[];
}

async function loadTreatmentsFromDb(): Promise<TreatmentRef[]> {
  const client = createPipelineClient();
  const { data, error } = await client
    .from("treatments")
    .select("id, name, category");

  if (error || !data) {
    console.error("[clinic-treatments] treatments 조회 실패:", error?.message);
    process.exit(1);
  }

  return data.map((t) => ({
    id: t.id as string,
    nameKo: (t.name as Record<string, string>)?.ko ?? "",
    nameEn: (t.name as Record<string, string>)?.en ?? "",
    category: t.category as string,
  }));
}

// ── Generate 모드 ───────────────────────────────────────────

/** 단일 클리닉 LLM 매핑 (건별 에러 격리) */
async function mapSingleClinic(
  clinic: ClinicTagData,
  model: Awaited<ReturnType<typeof getPipelineModel>>,
  treatmentListText: string,
  treatments: TreatmentRef[],
): Promise<TagMappingResult | null> {
  const cleaned = cleanTags(clinic.tags);
  if (cleaned.length === 0) return null; // 태그 없음 → fallback 대상

  const prompt = buildTagMappingPrompt(clinic, treatmentListText);
  const result = await generateText({ model, prompt });
  const parsed = parseTagMappingResponse(result.text, treatments);

  if (!parsed || parsed.treatmentIds.length === 0) return null;

  return {
    clinicId: clinic.clinicId,
    clinicNameKo: clinic.clinicNameKo,
    treatmentIds: parsed.treatmentIds,
    unmatchedTags: parsed.unmatchedTags,
  };
}

/** 태그 있는 클리닉 LLM 루프 (진행률 로깅 + rate limit) */
async function mapAllClinics(
  withTags: ClinicTagData[],
  model: Awaited<ReturnType<typeof getPipelineModel>>,
  treatmentListText: string,
  treatments: TreatmentRef[],
): Promise<TagMappingResult[]> {
  const mappings: TagMappingResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < withTags.length; i++) {
    try {
      const mapping = await mapSingleClinic(withTags[i], model, treatmentListText, treatments);
      if (mapping) { mappings.push(mapping); succeeded++; }
      else { failed++; }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [${i + 1}/${withTags.length}] ERROR: ${withTags[i].clinicNameKo} — ${msg}`);
      failed++;
    }
    if ((i + 1) % 20 === 0) console.log(`  [${i + 1}/${withTags.length}] (${succeeded} ok, ${failed} fail)`);
    if (i < withTags.length - 1) await sleep(CALL_DELAY_MS);
  }

  console.log(`[clinic-treatments] LLM 완료: ${succeeded} succeeded, ${failed} failed`);
  return mappings;
}

async function generateMappings(dryRun: boolean): Promise<void> {
  const clinicTags = loadClinicTags();
  const treatments = await loadTreatmentsFromDb();
  const withTags = clinicTags.filter((c) => cleanTags(c.tags).length > 0);
  const withoutTags = clinicTags.filter((c) => cleanTags(c.tags).length === 0);

  console.log(`[clinic-treatments] total: ${clinicTags.length}`);
  console.log(`[clinic-treatments] with-tags: ${withTags.length}, no-tags: ${withoutTags.length}`);
  console.log(`[clinic-treatments] treatments: ${treatments.length}`);

  if (dryRun) {
    console.log("[clinic-treatments] DRY RUN — LLM 호출 안 함");
    return;
  }

  const treatmentListText = buildTreatmentListText(treatments);
  const model = await getPipelineModel();
  const tagMappings = await mapAllClinics(withTags, model, treatmentListText, treatments);
  const tagJunctions = buildClinicTreatmentJunctions(tagMappings);

  const fallbackClinics = withoutTags.map((c) => ({
    id: c.clinicId, clinicType: c.clinicType, nameKo: c.clinicNameKo,
  }));
  const fallbackJunctions = buildFallbackJunctions(fallbackClinics, treatments);

  console.log(`[clinic-treatments] tag-based: ${tagJunctions.length}, fallback: ${fallbackJunctions.length}`);

  const treatmentNameMap = new Map(treatments.map((t) => [t.id, t.nameKo]));
  exportForReview([...tagJunctions, ...fallbackJunctions], treatmentNameMap, clinicTags);
}

// ── CSV Export (D-7 검수용) ──────────────────────────────────

function buildCsvRows(
  junctions: ClinicTreatmentRow[],
  clinicTagMap: Map<string, string>,
  clinicNameMap: Map<string, string>,
  treatmentNames: Map<string, string>,
): Record<string, string>[] {
  return junctions.map((row) => ({
    clinic_id: row.clinic_id,
    clinic_name_ko: clinicNameMap.get(row.clinic_id) ?? "",
    treatment_id: row.treatment_id,
    treatment_name_ko: treatmentNames.get(row.treatment_id) ?? "",
    source: clinicTagMap.get(row.clinic_id) ? "tag" : "fallback",
    kakao_tags: clinicTagMap.get(row.clinic_id) ?? "",
    is_approved: "",
    review_notes: "",
  }));
}

function exportForReview(
  junctions: ClinicTreatmentRow[],
  treatmentNames: Map<string, string>,
  clinicTags: ClinicTagData[],
): void {
  if (!existsSync(REVIEW_DIR)) mkdirSync(REVIEW_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const clinicNameMap = new Map(clinicTags.map((c) => [c.clinicId, c.clinicNameKo]));
  const clinicTagMap = new Map(
    clinicTags
      .filter((c) => cleanTags(c.tags).length > 0)
      .map((c) => [c.clinicId, c.tags.join(", ")]),
  );

  const jsonPath = join(REVIEW_DIR, `junction-clinic-treatments-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(junctions, null, 2));

  const csvRows = buildCsvRows(junctions, clinicTagMap, clinicNameMap, treatmentNames);
  const csvPath = join(REVIEW_DIR, `review-clinic-treatments-${timestamp}.csv`);
  const csvContent = stringifyCsvRows(csvRows, [
    "clinic_id",
    "clinic_name_ko",
    "treatment_id",
    "treatment_name_ko",
    "source",
    "kakao_tags",
    "is_approved",
    "review_notes",
  ]);
  writeFileSync(csvPath, csvContent);

  console.log(`[clinic-treatments] exported:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);
}

// ── Load 모드 (검수 완료 CSV → DB) ─────────────────────────

async function deleteExistingJunctions(): Promise<void> {
  const client = createPipelineClient();
  console.log("[clinic-treatments] deleting existing clinic_treatments...");
  const { error } = await client
    .from("clinic_treatments")
    .delete()
    .gte("clinic_id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("[clinic-treatments] DELETE 실패:", error.message);
    process.exit(1);
  }
  console.log("[clinic-treatments] DELETE 완료");
}

async function loadReviewed(csvPath: string): Promise<void> {
  const csvRows = parseCsvFile(csvPath);
  console.log(`[clinic-treatments] CSV rows: ${csvRows.length}`);

  const approved = csvRows.filter((row) => {
    const val = (row.is_approved ?? "").trim().toLowerCase();
    return ["true", "1", "yes"].includes(val);
  });
  console.log(`[clinic-treatments] approved: ${approved.length}`);

  if (approved.length === 0) {
    console.log("[clinic-treatments] 승인 건 없음 — 종료");
    return;
  }

  await deleteExistingJunctions();

  const junctionData: Record<string, unknown>[] = approved.map((row) => ({
    clinic_id: row.clinic_id,
    treatment_id: row.treatment_id,
  }));

  const client = createPipelineClient();
  const input: JunctionInput[] = [
    { type: "clinic_treatment", data: junctionData },
  ];
  const results = await loadJunctions(client, input);

  for (const r of results) {
    console.log(`  ${r.entityType}: ${r.inserted} inserted, ${r.failed} failed`);
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.warn(`    - ${e.message}`));
    }
  }
}

// ── 유틸 ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.load) {
    const csvPath = args.csv;
    if (!csvPath || csvPath === "true") {
      console.error("Error: --csv=<path> is required for --load mode");
      console.error(
        "Usage: npx tsx scripts/seed/generate-clinic-treatments.ts --load --csv=<path>",
      );
      process.exit(1);
    }
    await loadReviewed(csvPath);
  } else {
    const dryRun = !!args["dry-run"];
    await generateMappings(dryRun);
  }
}

main().catch((err) => {
  console.error("[clinic-treatments] Fatal:", err);
  process.exit(1);
});
