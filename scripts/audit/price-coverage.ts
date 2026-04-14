// ============================================================
// Price Coverage Audit — NEW-34
// products / treatments 가격 데이터 null 비율 + 분포 측정.
// 결과는 docs/audit/price-coverage-YYYYMMDD.md 로 출력.
//
// P-9: scripts/ → server/ import 금지 (server-only가 tsx에서 throw).
//      scripts/seed/lib/utils/db-client.ts 패턴 따라 독립 클라이언트 사용.
// Q-8: process.env 직접 접근은 이 파일 내 zod 스키마 한 곳에서만.
// G-10: 매직 넘버는 상단 상수.
//
// 실행: npx tsx scripts/audit/price-coverage.ts
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// 상수 (G-10)
// ─────────────────────────────────────────────────────────────
const HISTOGRAM_BINS = 10;
const HISTOGRAM_BAR_WIDTH = 40;
const QUANTILES = [0.25, 0.5, 0.75, 0.9] as const;
const PAGE_SIZE = 1000; // Supabase REST 기본 한계
const OUTPUT_DIR = join(process.cwd(), "docs", "audit");

// ─────────────────────────────────────────────────────────────
// 환경변수 (Q-8 — 이 파일 내 단일 검증점)
// ─────────────────────────────────────────────────────────────
const auditEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

function loadEnv(): z.infer<typeof auditEnvSchema> {
  const result = auditEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `\n[price-coverage] 환경변수 누락/유효하지 않음:\n${issues}\n\n` +
        `필요한 환경변수:\n` +
        `  NEXT_PUBLIC_SUPABASE_URL\n` +
        `  SUPABASE_SERVICE_ROLE_KEY\n\n` +
        `로컬 .env.local 또는 셸에 설정 후 재실행하세요.\n`,
    );
    process.exit(1);
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────
interface PriceRow {
  price: number | null;
  category: string | null;
}

interface TreatmentRow {
  price_min: number | null;
  price_max: number | null;
  category: string | null;
}

interface QuantileTable {
  count: number;
  min: number;
  max: number;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface CategoryStat {
  key: string;
  total: number;
  nullCount: number;
  nullRatio: number;
}

// ─────────────────────────────────────────────────────────────
// DB Fetch (페이지네이션)
// ─────────────────────────────────────────────────────────────
async function fetchAllProducts(client: SupabaseClient): Promise<PriceRow[]> {
  const out: PriceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("products")
      .select("price, category")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`products fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as PriceRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

async function fetchAllTreatments(
  client: SupabaseClient,
): Promise<TreatmentRow[]> {
  const out: TreatmentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("treatments")
      .select("price_min, price_max, category")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`treatments fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as TreatmentRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 통계 계산
// ─────────────────────────────────────────────────────────────
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1];
  if (next !== undefined) {
    return sortedAsc[base] + rest * (next - sortedAsc[base]);
  }
  return sortedAsc[base];
}

function computeQuantiles(values: number[]): QuantileTable {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length ? Math.round(sum / sorted.length) : 0,
    p25: Math.round(quantile(sorted, QUANTILES[0])),
    p50: Math.round(quantile(sorted, QUANTILES[1])),
    p75: Math.round(quantile(sorted, QUANTILES[2])),
    p90: Math.round(quantile(sorted, QUANTILES[3])),
  };
}

function computeCategoryStats(
  rows: { category: string | null; isNull: boolean }[],
): CategoryStat[] {
  const map = new Map<string, { total: number; nullCount: number }>();
  for (const r of rows) {
    const key = r.category ?? "(null)";
    const cur = map.get(key) ?? { total: 0, nullCount: 0 };
    cur.total += 1;
    if (r.isNull) cur.nullCount += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      total: v.total,
      nullCount: v.nullCount,
      nullRatio: v.total > 0 ? v.nullCount / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function buildHistogram(values: number[]): string {
  if (values.length === 0) return "(no data)";
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return `[${min.toLocaleString()}] ${"#".repeat(HISTOGRAM_BAR_WIDTH)} ${values.length}`;
  }
  const binSize = (max - min) / HISTOGRAM_BINS;
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= HISTOGRAM_BINS) idx = HISTOGRAM_BINS - 1;
    bins[idx] += 1;
  }
  const peak = Math.max(...bins);
  const lines: string[] = [];
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    const lo = Math.round(min + i * binSize);
    const hi = Math.round(min + (i + 1) * binSize);
    const barLen = peak > 0 ? Math.round((bins[i] / peak) * HISTOGRAM_BAR_WIDTH) : 0;
    const bar = "#".repeat(barLen).padEnd(HISTOGRAM_BAR_WIDTH, " ");
    lines.push(
      `[${lo.toString().padStart(9)} ~ ${hi.toString().padEnd(9)}] ${bar} ${bins[i]}`,
    );
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// 추천 티어 ($ / $$ / $$$) — quantile 기반 초안
// ─────────────────────────────────────────────────────────────
function suggestTiers(q: QuantileTable): {
  cheap: string;
  mid: string;
  premium: string;
} {
  return {
    cheap: `< ${q.p25.toLocaleString()} KRW`,
    mid: `${q.p25.toLocaleString()} ~ ${q.p75.toLocaleString()} KRW`,
    premium: `> ${q.p75.toLocaleString()} KRW (top ~25%)`,
  };
}

// ─────────────────────────────────────────────────────────────
// 리포트 렌더러
// ─────────────────────────────────────────────────────────────
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function renderQuantileTable(q: QuantileTable): string {
  return [
    `| metric | value (KRW) |`,
    `|---|---|`,
    `| count | ${q.count.toLocaleString()} |`,
    `| min | ${q.min.toLocaleString()} |`,
    `| p25 | ${q.p25.toLocaleString()} |`,
    `| p50 (median) | ${q.p50.toLocaleString()} |`,
    `| p75 | ${q.p75.toLocaleString()} |`,
    `| p90 | ${q.p90.toLocaleString()} |`,
    `| max | ${q.max.toLocaleString()} |`,
    `| mean | ${q.mean.toLocaleString()} |`,
  ].join("\n");
}

function renderCategoryTable(stats: CategoryStat[]): string {
  const rows = stats
    .map(
      (s) =>
        `| ${s.key} | ${s.total.toLocaleString()} | ${s.nullCount.toLocaleString()} | ${fmtPct(s.nullRatio)} |`,
    )
    .join("\n");
  return [`| category | total | null | null % |`, `|---|---:|---:|---:|`, rows].join(
    "\n",
  );
}

function renderObservations(opts: {
  productsTotal: number;
  productsNullRatio: number;
  treatmentsTotal: number;
  treatmentsMinNullRatio: number;
  treatmentsMaxNullRatio: number;
  worstProductCat: CategoryStat | undefined;
  worstTreatmentCat: CategoryStat | undefined;
}): string {
  const bullets: string[] = [];
  bullets.push(
    `- products: 총 ${opts.productsTotal.toLocaleString()}건 중 price null 비율 ${fmtPct(opts.productsNullRatio)}.`,
  );
  if (opts.worstProductCat) {
    bullets.push(
      `- products 카테고리별 최악: \`${opts.worstProductCat.key}\` (${fmtPct(opts.worstProductCat.nullRatio)} null, ${opts.worstProductCat.total}건).`,
    );
  }
  bullets.push(
    `- treatments: 총 ${opts.treatmentsTotal.toLocaleString()}건. price_min null ${fmtPct(opts.treatmentsMinNullRatio)}, price_max null ${fmtPct(opts.treatmentsMaxNullRatio)}.`,
  );
  if (opts.worstTreatmentCat) {
    bullets.push(
      `- treatments 카테고리별 최악: \`${opts.worstTreatmentCat.key}\` (${fmtPct(opts.worstTreatmentCat.nullRatio)} price_min null, ${opts.worstTreatmentCat.total}건).`,
    );
  }
  bullets.push(
    `- 일반 건강 범위: 핵심 표시 필드의 null 비율 < 10%. 위 수치를 이 기준과 비교해 보강 우선순위 도출.`,
  );
  return bullets.join("\n");
}

function getBranchName(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "(unknown)";
  }
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const env = loadEnv();
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  console.log("[price-coverage] Fetching products...");
  const products = await fetchAllProducts(client);
  console.log(`[price-coverage] products: ${products.length} rows`);

  console.log("[price-coverage] Fetching treatments...");
  const treatments = await fetchAllTreatments(client);
  console.log(`[price-coverage] treatments: ${treatments.length} rows`);

  // products 분석
  const productPrices = products
    .map((p) => p.price)
    .filter((v): v is number => typeof v === "number");
  const productNullCount = products.length - productPrices.length;
  const productNullRatio =
    products.length > 0 ? productNullCount / products.length : 0;
  const productQ = computeQuantiles(productPrices);
  const productCatStats = computeCategoryStats(
    products.map((p) => ({ category: p.category, isNull: p.price === null })),
  );
  const productHistogram = buildHistogram(productPrices);

  // treatments 분석
  const tPriceMin = treatments
    .map((t) => t.price_min)
    .filter((v): v is number => typeof v === "number");
  const tPriceMax = treatments
    .map((t) => t.price_max)
    .filter((v): v is number => typeof v === "number");
  const tMinNullCount = treatments.length - tPriceMin.length;
  const tMaxNullCount = treatments.length - tPriceMax.length;
  const tMinNullRatio =
    treatments.length > 0 ? tMinNullCount / treatments.length : 0;
  const tMaxNullRatio =
    treatments.length > 0 ? tMaxNullCount / treatments.length : 0;
  const tMinQ = computeQuantiles(tPriceMin);
  const tMaxQ = computeQuantiles(tPriceMax);
  const tCatStats = computeCategoryStats(
    treatments.map((t) => ({
      category: t.category,
      isNull: t.price_min === null,
    })),
  );
  const tMinHistogram = buildHistogram(tPriceMin);
  const tMaxHistogram = buildHistogram(tPriceMax);

  const worstProductCat = [...productCatStats]
    .filter((s) => s.total >= 5)
    .sort((a, b) => b.nullRatio - a.nullRatio)[0];
  const worstTreatmentCat = [...tCatStats]
    .filter((s) => s.total >= 5)
    .sort((a, b) => b.nullRatio - a.nullRatio)[0];

  // 리포트 작성
  const yyyymmdd = todayYYYYMMDD();
  const branch = getBranchName();
  const timestamp = new Date().toISOString();
  const productTiers = suggestTiers(productQ);
  const treatmentTiers = suggestTiers(tMinQ);

  const md = `# Price Coverage Audit — ${yyyymmdd}

- Generated: \`${timestamp}\`
- Branch: \`${branch}\`
- Script: \`scripts/audit/price-coverage.ts\` (NEW-34)

이 리포트는 NEW-35 (가격 티어 임계값 보정)의 입력으로 사용된다. 분석 대상은 \`products.price\` (KRW) 와 \`treatments.price_min\` / \`price_max\` (KRW). 모두 \`docs/03-design/schema.dbml\` 정의 기준.

---

## 1. Products

- Total rows: **${products.length.toLocaleString()}**
- \`price IS NULL\`: **${productNullCount.toLocaleString()}** (${fmtPct(productNullRatio)})
- Non-null sample: ${productPrices.length.toLocaleString()}

### Quantiles (non-null prices, KRW)

${renderQuantileTable(productQ)}

### Per-category breakdown

${renderCategoryTable(productCatStats)}

### Histogram (${HISTOGRAM_BINS} bins, non-null prices)

\`\`\`
${productHistogram}
\`\`\`

---

## 2. Treatments

- Total rows: **${treatments.length.toLocaleString()}**
- \`price_min IS NULL\`: **${tMinNullCount.toLocaleString()}** (${fmtPct(tMinNullRatio)})
- \`price_max IS NULL\`: **${tMaxNullCount.toLocaleString()}** (${fmtPct(tMaxNullRatio)})

### Quantiles — \`price_min\` (KRW)

${renderQuantileTable(tMinQ)}

### Quantiles — \`price_max\` (KRW)

${renderQuantileTable(tMaxQ)}

### Per-category breakdown (null = price_min IS NULL)

${renderCategoryTable(tCatStats)}

### Histogram — \`price_min\` (${HISTOGRAM_BINS} bins)

\`\`\`
${tMinHistogram}
\`\`\`

### Histogram — \`price_max\` (${HISTOGRAM_BINS} bins)

\`\`\`
${tMaxHistogram}
\`\`\`

---

## 3. Observations

${renderObservations({
  productsTotal: products.length,
  productsNullRatio: productNullRatio,
  treatmentsTotal: treatments.length,
  treatmentsMinNullRatio: tMinNullRatio,
  treatmentsMaxNullRatio: tMaxNullRatio,
  worstProductCat,
  worstTreatmentCat,
})}

---

## 4. Recommended tier thresholds (draft, for NEW-35)

티어 경계는 quantile 기반 초안. NEW-35에서 비즈니스 맥락(타깃 가격대, 경쟁 벤치마크) 반영해 확정.

### Products (\`price\`)

- \`$\` (cheap): ${productTiers.cheap}
- \`$$\` (mid): ${productTiers.mid}
- \`$$$\` (premium): ${productTiers.premium}

> 근거: p25=${productQ.p25.toLocaleString()} / p75=${productQ.p75.toLocaleString()} (median=${productQ.p50.toLocaleString()})

### Treatments (\`price_min\` 기준)

- \`$\` (cheap): ${treatmentTiers.cheap}
- \`$$\` (mid): ${treatmentTiers.mid}
- \`$$$\` (premium): ${treatmentTiers.premium}

> 근거: p25=${tMinQ.p25.toLocaleString()} / p75=${tMinQ.p75.toLocaleString()} (median=${tMinQ.p50.toLocaleString()})

### 주의

- null 비율이 높은 카테고리는 티어 분류에서 제외하거나 "가격 정보 없음" 별도 처리 필요.
- treatments는 \`price_min\` ~ \`price_max\` 구간 표현이므로, 단일 티어 매핑보다 "예상 시작가 기준 티어" + "범위 폭 표시" 방식 권장.
`;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, `price-coverage-${yyyymmdd}.md`);
  writeFileSync(outPath, md, "utf-8");
  console.log(`[price-coverage] Report written: ${outPath}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[price-coverage] FAILED: ${msg}`);
  process.exit(1);
});
