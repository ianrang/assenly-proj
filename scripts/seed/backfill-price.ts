// ============================================================
// Price Backfill — NEW-36
// 2단계 fallback: 36-a OY 실가격 보강 → 36-d 카테고리 기본값.
// + treatments/products 메타데이터 백필.
//
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Q-11: 배치 단위 실패 처리 (개별 실패 스킵).
// Q-12: 멱등성 — WHERE 조건으로 중복 방지.
//
// 실행: npx tsx scripts/seed/backfill-price.ts [--dry-run]
// ============================================================

import { chromium, type Browser } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchProductPrice } from "./lib/oy-parser";

// ─────────────────────────────────────────────────────────────
// 상수 (G-10)
// ─────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;
const CRAWL_DELAY_MS = 3_000;

// ─────────────────────────────────────────────────────────────
// 덮어쓰기 우선순위 (§2.4)
// manual > real > category-default
// ─────────────────────────────────────────────────────────────
const SOURCE_PRIORITY: Record<string, number> = {
  manual: 3,
  real: 2,
  "estimated-pipeline": 1,
  "estimated-ai": 1,
  "category-default": 0,
};

export function shouldOverwrite(
  existingSource: string | null,
  newSource: string,
): boolean {
  if (existingSource === null) return true;
  const existingPriority = SOURCE_PRIORITY[existingSource] ?? -1;
  const newPriority = SOURCE_PRIORITY[newSource] ?? -1;
  return newPriority > existingPriority;
}

// ─────────────────────────────────────────────────────────────
// 카테고리 fallback (36-d)
// ─────────────────────────────────────────────────────────────
export interface CategoryQuantile {
  p25: number;
  p75: number;
}

export function computeCategoryFallback(
  category: string,
  quantiles: Record<string, CategoryQuantile>,
): { priceMin: number; priceMax: number } | null {
  const q = quantiles[category];
  if (!q) return null;
  return { priceMin: q.p25, priceMax: q.p75 };
}

// ─────────────────────────────────────────────────────────────
// 환경변수 (Q-8)
// ─────────────────────────────────────────────────────────────
const backfillEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

function loadEnv(): z.infer<typeof backfillEnvSchema> {
  const result = backfillEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `\n[backfill-price] 환경변수 누락:\n${issues}\n\n` +
        `필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n`,
    );
    process.exit(1);
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  url: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_source: string | null;
  range_source: string | null;
  category: string | null;
}

interface BackfillReport {
  phase36a: { attempted: number; success: number; failed: number; skipped: number };
  phase36d: { applied: number; skipped: number; noCategoryMatch: number };
  metadata: { treatmentsUpdated: number; productsDriftFixed: number };
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// 36-a: OY 실가격 보강
// ─────────────────────────────────────────────────────────────
async function runPhase36a(
  client: SupabaseClient,
  dryRun: boolean,
): Promise<BackfillReport["phase36a"]> {
  console.log("\n=== 36-a: OY 실가격 보강 ===");

  const { data: rows, error } = await client
    .from("products")
    .select("id, purchase_links, price, price_source, category")
    .is("price", null);

  if (error) {
    console.error("[36-a] DB 조회 실패:", error.message);
    return { attempted: 0, success: 0, failed: 0, skipped: 0 };
  }

  type PurchaseLink = { platform: string; url: string };

  const targets = ((rows ?? []) as Array<{
    id: string;
    purchase_links: PurchaseLink[] | null;
    price_source: string | null;
    category: string | null;
  }>)
    .map((row) => {
      const oyLink = (row.purchase_links ?? []).find(
        (l) => l.url?.includes("global.oliveyoung.com"),
      );
      return oyLink ? { ...row, oyUrl: oyLink.url } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`  대상: ${targets.length}건 (price IS NULL + OY URL 보유)`);

  if (targets.length === 0) {
    return { attempted: 0, success: 0, failed: 0, skipped: 0 };
  }

  const report = { attempted: targets.length, success: 0, failed: 0, skipped: 0 };

  if (dryRun) {
    console.log(`  [DRY-RUN] ${targets.length}건 OY 가격 추출 예정`);
    targets.forEach((t) => console.log(`    - ${t.id} (${t.category})`));
    return report;
  }

  const browser: Browser = await chromium.launch({ headless: true });

  try {
    const batches: Array<typeof targets> = [];
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      batches.push(targets.slice(i, i + BATCH_SIZE));
    }

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      console.log(`  배치 ${bi + 1}/${batches.length} (${batch.length}건)`);

      for (const product of batch) {
        if (!shouldOverwrite(product.price_source, "real")) {
          console.log(`    ⏭ ${product.id} — price_source='${product.price_source}' 우선순위 높음, 스킵`);
          report.skipped++;
          continue;
        }

        try {
          const result = await fetchProductPrice(browser, product.oyUrl);

          if (!result) {
            console.log(`    ✗ ${product.id} — 가격 추출 실패`);
            report.failed++;
            continue;
          }

          const { error: updateError } = await client
            .from("products")
            .update({
              price: result.price,
              price_min: result.price,
              price_max: result.priceOriginal ?? result.price,
              price_source: "real",
              range_source: "real",
              price_source_url: product.oyUrl,
              price_updated_at: new Date().toISOString(),
            })
            .eq("id", product.id)
            .is("price", null);

          if (updateError) {
            console.log(`    ✗ ${product.id} — DB 업데이트 실패: ${updateError.message}`);
            report.failed++;
          } else {
            console.log(`    ✓ ${product.id} — ₩${result.price.toLocaleString()}`);
            report.success++;
          }
        } catch (err) {
          console.log(`    ✗ ${product.id} — 에러: ${err instanceof Error ? err.message : String(err)}`);
          report.failed++;
        }
      }

      if (bi < batches.length - 1) {
        await delay(CRAWL_DELAY_MS);
      }
    }
  } finally {
    await browser.close();
  }

  return report;
}

// ─────────────────────────────────────────────────────────────
// 카테고리별 quantile 실시간 산출
// ─────────────────────────────────────────────────────────────
async function computeQuantiles(
  client: SupabaseClient,
): Promise<Record<string, CategoryQuantile>> {
  const { data: rows, error } = await client
    .from("products")
    .select("category, price")
    .not("price", "is", null);

  if (error || !rows) {
    console.error("[quantile] DB 조회 실패:", error?.message);
    return {};
  }

  const byCategory: Record<string, number[]> = {};
  for (const row of rows as Array<{ category: string; price: number }>) {
    if (!row.category) continue;
    if (!byCategory[row.category]) byCategory[row.category] = [];
    byCategory[row.category].push(row.price);
  }

  const result: Record<string, CategoryQuantile> = {};
  for (const [cat, prices] of Object.entries(byCategory)) {
    prices.sort((a, b) => a - b);
    result[cat] = {
      p25: quantile(prices, 0.25),
      p75: quantile(prices, 0.75),
    };
  }

  return result;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return Math.round(sorted[base] + rest * (sorted[base + 1] - sorted[base]));
  }
  return sorted[base];
}

// ─────────────────────────────────────────────────────────────
// 36-d: 카테고리 기본값 fallback
// ─────────────────────────────────────────────────────────────
async function runPhase36d(
  client: SupabaseClient,
  dryRun: boolean,
): Promise<BackfillReport["phase36d"]> {
  console.log("\n=== 36-d: 카테고리 기본값 fallback ===");

  const quantiles = await computeQuantiles(client);
  console.log("  카테고리별 quantile:");
  for (const [cat, q] of Object.entries(quantiles)) {
    console.log(`    ${cat}: p25=₩${q.p25.toLocaleString()}, p75=₩${q.p75.toLocaleString()}`);
  }

  const { data: rows, error } = await client
    .from("products")
    .select("id, category, price, price_min, range_source")
    .is("price", null)
    .is("price_min", null);

  if (error) {
    console.error("[36-d] DB 조회 실패:", error.message);
    return { applied: 0, skipped: 0, noCategoryMatch: 0 };
  }

  const targets = (rows ?? []) as Array<{
    id: string;
    category: string | null;
    range_source: string | null;
  }>;
  console.log(`  대상: ${targets.length}건 (price IS NULL AND price_min IS NULL)`);

  const report = { applied: 0, skipped: 0, noCategoryMatch: 0 };

  for (const product of targets) {
    if (!shouldOverwrite(product.range_source, "category-default")) {
      console.log(`    ⏭ ${product.id} — range_source='${product.range_source}' 우선순위 높음, 스킵`);
      report.skipped++;
      continue;
    }

    if (!product.category) {
      console.log(`    ⚠ ${product.id} — 카테고리 없음, 스킵`);
      report.noCategoryMatch++;
      continue;
    }

    const fallback = computeCategoryFallback(product.category, quantiles);
    if (!fallback) {
      console.log(`    ⚠ ${product.id} — 카테고리 '${product.category}' quantile 없음, 스킵`);
      report.noCategoryMatch++;
      continue;
    }

    if (dryRun) {
      console.log(`    [DRY-RUN] ${product.id} — ${product.category}: ₩${fallback.priceMin.toLocaleString()}~₩${fallback.priceMax.toLocaleString()}`);
      report.applied++;
      continue;
    }

    const { error: updateError } = await client
      .from("products")
      .update({
        price_min: fallback.priceMin,
        price_max: fallback.priceMax,
        range_source: "category-default",
        price_updated_at: new Date().toISOString(),
      })
      .eq("id", product.id)
      .is("price", null)
      .is("price_min", null);

    if (updateError) {
      console.log(`    ✗ ${product.id} — DB 업데이트 실패: ${updateError.message}`);
    } else {
      console.log(`    ✓ ${product.id} — ${product.category}: ₩${fallback.priceMin.toLocaleString()}~₩${fallback.priceMax.toLocaleString()}`);
      report.applied++;
    }
  }

  return report;
}

// ─────────────────────────────────────────────────────────────
// 메타데이터 백필
// ─────────────────────────────────────────────────────────────
async function runMetadataBackfill(
  client: SupabaseClient,
  dryRun: boolean,
): Promise<BackfillReport["metadata"]> {
  console.log("\n=== 메타데이터 백필 ===");

  const report = { treatmentsUpdated: 0, productsDriftFixed: 0 };

  // treatments: price_source IS NULL → 'manual'
  const { count: treatmentCount, error: tCountErr } = await client
    .from("treatments")
    .select("id", { count: "exact", head: true })
    .is("price_source", null);

  if (tCountErr) {
    console.error("[metadata] treatments 조회 실패:", tCountErr.message);
  } else {
    const count = treatmentCount ?? 0;
    console.log(`  treatments price_source NULL: ${count}건`);

    if (count > 0) {
      if (dryRun) {
        console.log(`  [DRY-RUN] ${count}건 → price_source='manual', range_source='manual'`);
        report.treatmentsUpdated = count;
      } else {
        const { error: updateErr } = await client
          .from("treatments")
          .update({
            price_source: "manual",
            range_source: "manual",
          })
          .is("price_source", null);

        if (updateErr) {
          console.error("[metadata] treatments 업데이트 실패:", updateErr.message);
        } else {
          console.log(`  ✓ treatments ${count}건 → price_source='manual', range_source='manual'`);
          report.treatmentsUpdated = count;
        }
      }
    }
  }

  // products drift: price IS NOT NULL AND price_source IS NULL → 'real'
  const { count: driftCount, error: dCountErr } = await client
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("price", "is", null)
    .is("price_source", null);

  if (dCountErr) {
    console.error("[metadata] products drift 조회 실패:", dCountErr.message);
  } else {
    const count = driftCount ?? 0;
    console.log(`  products drift (price SET, source NULL): ${count}건`);

    if (count > 0) {
      if (dryRun) {
        console.log(`  [DRY-RUN] ${count}건 → price_source='real'`);
        report.productsDriftFixed = count;
      } else {
        const { error: updateErr } = await client
          .from("products")
          .update({ price_source: "real" })
          .not("price", "is", null)
          .is("price_source", null);

        if (updateErr) {
          console.error("[metadata] products drift 업데이트 실패:", updateErr.message);
        } else {
          console.log(`  ✓ products drift ${count}건 → price_source='real'`);
          report.productsDriftFixed = count;
        }
      }
    }
  }

  return report;
}

// ─────────────────────────────────────────────────────────────
// 리포트 출력
// ─────────────────────────────────────────────────────────────
function printReport(report: BackfillReport, dryRun: boolean): void {
  console.log("\n" + "=".repeat(50));
  console.log(dryRun ? "📋 DRY-RUN 결과 리포트" : "📋 실행 결과 리포트");
  console.log("=".repeat(50));
  console.log(`\n36-a OY 실가격 보강:`);
  console.log(`  대상: ${report.phase36a.attempted}건`);
  console.log(`  성공: ${report.phase36a.success}건`);
  console.log(`  실패: ${report.phase36a.failed}건`);
  console.log(`  스킵: ${report.phase36a.skipped}건`);
  console.log(`\n36-d 카테고리 기본값:`);
  console.log(`  적용: ${report.phase36d.applied}건`);
  console.log(`  스킵: ${report.phase36d.skipped}건`);
  console.log(`  카테고리 매칭 실패: ${report.phase36d.noCategoryMatch}건`);
  console.log(`\n메타데이터 백필:`);
  console.log(`  treatments: ${report.metadata.treatmentsUpdated}건`);
  console.log(`  products drift: ${report.metadata.productsDriftFixed}건`);
  console.log("=".repeat(50));
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("🔍 DRY-RUN 모드 — DB 쓰기 없이 결과만 출력합니다.\n");
  }

  const env = loadEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const phase36a = await runPhase36a(client, dryRun);
  const phase36d = await runPhase36d(client, dryRun);
  const metadata = await runMetadataBackfill(client, dryRun);

  printReport({ phase36a, phase36d, metadata }, dryRun);
}

const isDirectRun = process.argv[1]?.endsWith("backfill-price.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[backfill-price] 치명적 에러:", err);
    process.exit(1);
  });
}
