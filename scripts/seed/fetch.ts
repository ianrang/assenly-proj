// ============================================================
// Stage 1 CLI — 외부 데이터 수집
// Usage: npx tsx scripts/seed/fetch.ts [--targets places,ingredients,products] [--output ./data/raw.json]
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs, splitArg } from "./parse-args";
import { fetchAllRecords } from "./lib/fetch-service";
import type { FetchOptions } from "./lib/fetch-service";

async function main() {
  const args = parseArgs();
  const targets = splitArg(args.targets) as FetchOptions["targets"];
  const output = args.output ?? "./data/raw.json";

  const options: FetchOptions = {};
  if (targets && targets.length > 0) options.targets = targets;

  if (args["place-queries"]) {
    options.placeQueries = JSON.parse(
      readFileSync(args["place-queries"], "utf-8"),
    );
  }

  console.log(`[fetch] targets: ${targets?.join(", ") ?? "all"}`);

  const { records, result } = await fetchAllRecords(options);

  writeFileSync(output, JSON.stringify(records, null, 2));

  console.log(`[fetch] ${result.succeeded} records → ${output}`);
  if (result.failed > 0) {
    console.warn(`[fetch] ${result.failed} errors:`);
    result.errors.forEach((e) => console.warn(`  - ${e.message}`));
  }
}

main().catch((err) => { console.error("[fetch] Fatal:", err); process.exit(1); });
