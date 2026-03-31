// ============================================================
// 전체 파이프라인 CLI — Stage 1→2→3(→4)
// 기본: fetch → enrich → export-review → 중단 (검수 대기)
// --auto-approve: fetch → enrich → (자동 승인) → validate → load
// Usage: npx tsx scripts/seed/run-all.ts [--auto-approve] [--dry-run] [--output-dir ./review/]
//        [--skip-translation] [--skip-classification] [--skip-generation]
// ============================================================

import { parseArgs } from "./parse-args";
import { fetchAllRecords } from "./lib/fetch-service";
import { enrichRecords } from "./lib/enrich-service";
import { exportForReview } from "./lib/review-exporter";
import { createPipelineClient } from "./lib/db-client";
import { loadRecords } from "./lib/loader";
import { validateWithSchemas } from "./lib/entity-schemas";

import type { EnrichedRecord, ValidatedRecord } from "./lib/types";
import type { EnrichOptions } from "./lib/enrich-service";

async function main() {
  const args = parseArgs();
  const autoApprove = !!args["auto-approve"];

  const enriched = await runFetchAndEnrich(args);
  if (enriched.length === 0) return;

  if (!autoApprove) {
    runReviewExport(enriched, args["output-dir"]);
    return;
  }

  await runAutoApproveAndLoad(enriched, !!args["dry-run"]);
}

/** Stage 1(fetch) + Stage 2(enrich) 실행 */
async function runFetchAndEnrich(
  args: Record<string, string>,
): Promise<EnrichedRecord[]> {
  console.log("\n[Stage 1] Fetching data...");
  const { records: raw, result: fetchResult } = await fetchAllRecords();
  console.log(`[Stage 1] ${fetchResult.succeeded} records, ${fetchResult.failed} errors`);

  if (raw.length === 0) {
    console.log("[run-all] No records to process.");
    return [];
  }

  console.log("\n[Stage 2] Enriching data...");
  const enrichOptions: EnrichOptions = {};
  if (args["skip-translation"]) enrichOptions.skipTranslation = true;
  if (args["skip-classification"]) enrichOptions.skipClassification = true;
  if (args["skip-generation"]) enrichOptions.skipGeneration = true;

  const { records: enriched, result } = await enrichRecords(raw, enrichOptions);
  console.log(`[Stage 2] ${result.succeeded} enriched, ${result.failed} errors`);
  return enriched;
}

/** 검수 모드: export + 중단 */
function runReviewExport(enriched: EnrichedRecord[], outputDir?: string): void {
  console.log("\n[Stage 3] Exporting for review...");
  const result = exportForReview(enriched, { outputDir });
  console.log(`[Stage 3] ${result.total} exported`);
  for (const file of result.files) {
    console.log(`  ${file.entityType}: ${file.csvPath}`);
  }
  console.log("\n검수 완료 후 실행:");
  console.log("  1. npx tsx scripts/seed/import-review.ts --enriched <json> --reviewed <csv>");
  console.log("  2. npx tsx scripts/seed/load.ts --input <validated.json>");
}

/** 자동 모드: 자동 승인 → validate → load */
async function runAutoApproveAndLoad(
  enriched: EnrichedRecord[],
  dryRun: boolean,
): Promise<void> {
  console.log("\n[Stage 3] Auto-approving all records...");
  const validated = autoApproveRecords(enriched);
  console.log(`[Stage 3] ${validated.length} auto-approved`);

  console.log("\n[Stage 4a] Validating...");
  const { passed, failed, errors: valErrors } = validateWithSchemas(validated);
  for (const err of valErrors) console.error(`  [FAIL] ${err}`);
  console.log(`[Stage 4a] ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error("[run-all] Validation failed. Aborting load.");
    process.exit(1);
  }

  console.log(`\n[Stage 4b] Loading to DB...${dryRun ? " [DRY RUN]" : ""}`);
  const client = createPipelineClient();
  const results = await loadRecords(client, validated, { dryRun });

  for (const r of results) {
    console.log(`  ${r.entityType}: ${r.inserted} inserted, ${r.failed} failed`);
  }
  console.log(`\n[run-all] Complete. ${results.reduce((s, r) => s + r.inserted, 0)} loaded.`);
}

/** EnrichedRecord[] → ValidatedRecord[] (전체 자동 승인) */
function autoApproveRecords(records: EnrichedRecord[]): ValidatedRecord[] {
  return records.map((r) => ({
    entityType: r.entityType,
    data: r.data as Record<string, unknown>,
    isApproved: true,
    reviewedBy: "auto-pipeline",
  }));
}

main().catch((err) => { console.error("[run-all] Fatal:", err); process.exit(1); });
