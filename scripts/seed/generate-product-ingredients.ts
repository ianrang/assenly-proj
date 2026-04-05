// ============================================================
// P2-64c-2: product_ingredients junction LLM 자동 매핑
// 제품별 LLM 호출 → key/avoid 성분 매핑 → CSV export (D-7 검수)
// → 검수 완료 CSV import → loadJunctions() 적재
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage:
//   npx tsx scripts/seed/generate-product-ingredients.ts --generate [--dry-run]
//   npx tsx scripts/seed/generate-product-ingredients.ts --load --csv=<path>
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";

import { getPipelineModel } from "./lib/enrichment/ai-client";
import { createPipelineClient } from "./lib/utils/db-client";
import { loadJunctions } from "./lib/loader";
import { parseCsvFile, stringifyCsvRows } from "./lib/utils/csv-parser";
import { parseArgs } from "./parse-args";
import type { ValidatedRecord } from "./lib/types";
import type { JunctionInput } from "./lib/loader";

import {
  buildIngredientRefs,
  buildCanonicalMap,
  buildNameToIdMap,
  buildIngredientListText,
  buildMappingPrompt,
  parseMappingResponse,
  buildJunctionData,
  type IngredientRef,
  type MappingResult,
  type JunctionRow,
} from "./lib/ingredient-mapper";

// ── 상수 (G-10) ────────────────────────────────────────────

/** LLM 호출 간 딜레이 (ms) — rate limit 방지 */
const CALL_DELAY_MS = 300;

const REVIEW_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "review-data",
);

// ── 데이터 로드 헬퍼 ────────────────────────────────────────

function loadApprovedProducts(): ValidatedRecord[] {
  const products: ValidatedRecord[] = JSON.parse(
    readFileSync("scripts/seed/data/products-validated.json", "utf-8"),
  );
  return products.filter((r) => r.isApproved);
}

function loadApprovedIngredients(): IngredientRef[] {
  const records: ValidatedRecord[] = JSON.parse(
    readFileSync("scripts/seed/data/ingredients-validated.json", "utf-8"),
  );
  const approved = records.filter((r) => r.isApproved);

  return buildIngredientRefs(
    approved.map((r) => ({
      id: r.data.id as string,
      nameEn: (r.data.name as Record<string, string>)?.en ?? "",
      inciName: (r.data.inci_name as string) ?? "",
      functions: (r.data.function as string[]) ?? [],
      cautionSkinTypes: (r.data.caution_skin_types as string[]) ?? [],
    })),
  );
}

// ── Generate 모드 ───────────────────────────────────────────

/** 단일 제품 LLM 매핑 (건별 에러 격리) */
async function mapSingleProduct(
  product: ValidatedRecord,
  model: Awaited<ReturnType<typeof getPipelineModel>>,
  ingredientListText: string,
  lowerToCanonical: Map<string, string>,
): Promise<MappingResult | null> {
  const data = product.data as Record<string, unknown>;
  const nameEn = (data.name as Record<string, string>)?.en ?? (data.name_en as string) ?? "";

  const prompt = buildMappingPrompt(
    {
      nameEn,
      category: (data.category as string) ?? "",
      subcategory: (data.subcategory as string) ?? "",
      skinTypes: (data.skin_types as string[]) ?? [],
      concerns: (data.concerns as string[]) ?? [],
    },
    ingredientListText,
  );

  const result = await generateText({ model, prompt });
  const parsed = parseMappingResponse(result.text, lowerToCanonical);

  if (!parsed || (parsed.key.length === 0 && parsed.avoid.length === 0)) {
    return null;
  }

  return {
    productId: data.id as string,
    productNameEn: nameEn,
    key: parsed.key,
    avoid: parsed.avoid,
  };
}

function extractProductName(product: ValidatedRecord): string {
  const data = product.data as Record<string, unknown>;
  return (data.name as Record<string, string>)?.en ?? (data.name_en as string) ?? "";
}

/** 전체 제품 LLM 루프 (진행률 로깅 + rate limit) */
async function mapAllProducts(
  products: ValidatedRecord[],
  ingredients: IngredientRef[],
): Promise<MappingResult[]> {
  const lowerToCanonical = buildCanonicalMap(ingredients);
  const ingredientListText = buildIngredientListText(ingredients);

  const model = await getPipelineModel();
  const mappings: MappingResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    try {
      const mapping = await mapSingleProduct(products[i], model, ingredientListText, lowerToCanonical);
      if (mapping) {
        mappings.push(mapping);
        succeeded++;
      } else {
        const name = extractProductName(products[i]);
        console.warn(`  [${i + 1}/${products.length}] PARSE FAIL: ${name}`);
        failed++;
      }
    } catch (err) {
      const name = extractProductName(products[i]);
      console.warn(`  [${i + 1}/${products.length}] LLM ERROR: ${name} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    if (i % 20 === 19) {
      console.log(`  [${i + 1}/${products.length}] processed (${succeeded} ok, ${failed} fail)`);
    }
    if (i < products.length - 1) await sleep(CALL_DELAY_MS);
  }

  console.log(`[product-ingredients] LLM 완료: ${succeeded} succeeded, ${failed} failed`);
  return mappings;
}

async function generateMappings(dryRun: boolean): Promise<void> {
  const products = loadApprovedProducts();
  const ingredients = loadApprovedIngredients();

  console.log(`[product-ingredients] products: ${products.length}`);
  console.log(`[product-ingredients] ingredients: ${ingredients.length}`);

  if (dryRun) {
    console.log(`[product-ingredients] DRY RUN — LLM 호출 안 함`);
    console.log(`[product-ingredients] 예상 junction: ${products.length} products × ~3.5 avg = ~${Math.round(products.length * 3.5)}`);
    return;
  }

  const nameToId = buildNameToIdMap(ingredients);
  const mappings = await mapAllProducts(products, ingredients);
  const junctionData = buildJunctionData(mappings, nameToId);
  console.log(`[product-ingredients] junction 생성: ${junctionData.length}건`);

  const typeStats = { key: 0, avoid: 0 };
  for (const row of junctionData) {
    typeStats[row.type]++;
  }
  console.log(`[product-ingredients] type별: key=${typeStats.key}, avoid=${typeStats.avoid}`);

  exportForReview(junctionData, ingredients, products);
}

// ── CSV Export (D-7 검수용) ──────────────────────────────────

function exportForReview(
  junctionData: JunctionRow[],
  ingredients: IngredientRef[],
  products: ValidatedRecord[],
): void {
  if (!existsSync(REVIEW_DIR)) mkdirSync(REVIEW_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // ID → name 역매핑
  const ingredientNames = new Map<string, string>();
  for (const ing of ingredients) {
    ingredientNames.set(ing.id, ing.displayName);
  }
  const productNames = new Map<string, string>();
  for (const p of products) {
    const data = p.data as Record<string, unknown>;
    const nameEn = (data.name as Record<string, string>)?.en ?? (data.name_en as string) ?? "";
    productNames.set(data.id as string, nameEn);
  }

  // JSON (원본 보존)
  const jsonPath = join(REVIEW_DIR, `junction-product-ingredients-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(junctionData, null, 2));

  // CSV (검수용)
  const csvRows = junctionData.map((row) => ({
    product_id: row.product_id,
    product_name_en: productNames.get(row.product_id) ?? "",
    ingredient_id: row.ingredient_id,
    ingredient_name_en: ingredientNames.get(row.ingredient_id) ?? "",
    type: row.type,
    is_approved: "",
    review_notes: "",
  }));

  const csvPath = join(REVIEW_DIR, `review-product-ingredients-${timestamp}.csv`);
  const csvContent = stringifyCsvRows(csvRows, [
    "product_id", "product_name_en", "ingredient_id",
    "ingredient_name_en", "type", "is_approved", "review_notes",
  ]);
  writeFileSync(csvPath, csvContent);

  console.log(`[product-ingredients] exported:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);
}

// ── Load 모드 (검수 완료 CSV → DB) ─────────────────────────

async function loadReviewed(csvPath: string): Promise<void> {
  const csvRows = parseCsvFile(csvPath);
  console.log(`[product-ingredients] CSV rows: ${csvRows.length}`);

  const approved = csvRows.filter((row) => {
    const val = (row.is_approved ?? "").trim().toLowerCase();
    return ["true", "1", "yes"].includes(val);
  });
  console.log(`[product-ingredients] approved: ${approved.length}`);

  if (approved.length === 0) {
    console.log("[product-ingredients] 승인 건 없음 — 종료");
    return;
  }

  const junctionData: Record<string, unknown>[] = approved.map((row) => ({
    product_id: row.product_id,
    ingredient_id: row.ingredient_id,
    type: row.type,
  }));

  const client = createPipelineClient();
  const input: JunctionInput[] = [
    { type: "product_ingredient", data: junctionData },
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
      console.error("Usage: npx tsx scripts/seed/generate-product-ingredients.ts --load --csv=<path>");
      process.exit(1);
    }
    await loadReviewed(csvPath);
  } else {
    const dryRun = !!args["dry-run"];
    await generateMappings(dryRun);
  }
}

main().catch((err) => {
  console.error("[product-ingredients] Fatal:", err);
  process.exit(1);
});
