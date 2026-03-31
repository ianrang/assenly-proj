// ============================================================
// Stage 4 CLI — DB 없이 zod 검증 (독립)
// Usage: npx tsx scripts/seed/validate.ts --input ./data/validated.json [--entity-types product,brand]
// ============================================================

import { readFileSync } from "node:fs";
import { parseArgs, requireArg, splitArg } from "./parse-args";
import { validateWithSchemas } from "./lib/entity-schemas";
import type { EntityType, ValidatedRecord } from "./lib/types";

const USAGE = "npx tsx scripts/seed/validate.ts --input <path> [--entity-types <list>]";

async function main() {
  const args = parseArgs();
  const input = requireArg(args, "input", USAGE);
  const filterTypes = splitArg(args["entity-types"]) as EntityType[];

  const records: ValidatedRecord[] = JSON.parse(readFileSync(input, "utf-8"));

  console.log(`[validate] input: ${input} (${records.length} records)`);

  const { passed, failed, errors } = validateWithSchemas(
    records,
    filterTypes.length > 0 ? filterTypes : undefined,
  );

  for (const err of errors) console.error(`  [FAIL] ${err}`);
  console.log(`\n[validate] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error("[validate] Fatal:", err); process.exit(1); });
