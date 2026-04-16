// ============================================================
// 올리브영 브랜드별 제품 목록 수집 → DB 실패 제품 fuzzy 매칭
// 브랜드명으로 OY Global 검색 → 해당 브랜드 전체 제품 수집 → 매칭
//
// 실행: npx tsx scripts/seed/match-oy-products.ts
// ============================================================

import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.join(__dirname, "data");
const FAILURES_PATH = path.join(DATA_DIR, "products-enrich-failures.json");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const MAPPING_PATH = path.join(DATA_DIR, "products-oy-mapping.json");
const OY_BASE = "https://global.oliveyoung.com";
const CRAWL_DELAY_MS = 3_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 단어 겹침 기반 유사도 (0~1) */
function wordSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const wordsA = normalize(a);
  const wordsB = new Set(normalize(b));
  if (wordsA.length === 0) return 0;
  const matches = wordsA.filter((w) => wordsB.has(w)).length;
  return matches / wordsA.length;
}

interface OYProduct {
  name: string;
  url: string;
  imageUrl: string | null;
}

/** 브랜드명으로 OY 검색 → 전체 제품 목록 */
async function scrapeProductsByBrand(page: Page, brand: string): Promise<OYProduct[]> {
  const url = `${OY_BASE}/display/search?query=${encodeURIComponent(brand)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForSelector(".unit-desc", { timeout: 10_000 }).catch(() => {});
  await delay(CRAWL_DELAY_MS);

  const cards = await page.$$eval(
    ".unit-desc a[href*='product/detail']",
    (els: HTMLAnchorElement[]) =>
      els.map((el) => ({
        name: el.textContent?.trim().replace(/\s+/g, " ") ?? "",
        url: el.href,
      })),
  );

  const thumbs = await page.$$eval(
    ".unit-thumb img",
    (els: HTMLImageElement[]) => els.map((el) => el.src),
  );

  return cards.map((c, i) => ({
    name: c.name,
    url: c.url,
    imageUrl: thumbs[i] && thumbs[i].startsWith("https://") ? thumbs[i] : null,
  }));
}

interface MappingResult {
  dbId: string;
  dbBrand: string;
  dbName: string;
  oyName: string | null;
  oyUrl: string | null;
  oyImage: string | null;
  similarity: number;
  status: "matched" | "not_found" | "low_confidence";
}

async function main() {
  const failures: Array<{ id: string; name: string }> = JSON.parse(
    fs.readFileSync(FAILURES_PATH, "utf-8"),
  );
  const validated = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));
  const products = validated.filter(
    (r: { entityType: string }) => r.entityType === "product",
  );

  // Group failures by brand
  const byBrand = new Map<string, Array<{ id: string; name: string; brand: string }>>();
  for (const f of failures) {
    const p = products.find((pr: { data: { id: string } }) => pr.data.id === f.id);
    if (!p) continue;
    const brand = p.data.brand || "";
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand)!.push({ id: f.id, name: p.data.name?.en || p.data.name_en || "", brand });
  }

  console.log(`실패 제품: ${failures.length}건, 브랜드: ${byBrand.size}개`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: MappingResult[] = [];

  let brandIdx = 0;
  for (const [brand, dbProducts] of byBrand) {
    brandIdx++;
    console.log(`\n[${brandIdx}/${byBrand.size}] 브랜드: ${brand} (${dbProducts.length}건)`);

    const oyProducts = await scrapeProductsByBrand(page, brand);
    console.log(`  OY 검색 결과: ${oyProducts.length}건`);

    for (const dbProd of dbProducts) {
      let bestMatch: OYProduct | null = null;
      let bestScore = 0;

      for (const oyProd of oyProducts) {
        const score = wordSimilarity(dbProd.name, oyProd.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = oyProd;
        }
      }

      if (bestMatch && bestScore >= 0.4) {
        console.log(`  ✓ [${bestScore.toFixed(2)}] ${dbProd.name}`);
        console.log(`    → ${bestMatch.name}`);
        results.push({
          dbId: dbProd.id,
          dbBrand: brand,
          dbName: dbProd.name,
          oyName: bestMatch.name,
          oyUrl: bestMatch.url,
          oyImage: bestMatch.imageUrl,
          similarity: bestScore,
          status: bestScore >= 0.5 ? "matched" : "low_confidence",
        });
      } else {
        console.log(`  ✗ ${dbProd.name} — 매칭 없음${bestMatch ? ` (최고 ${bestScore.toFixed(2)}: ${bestMatch.name.substring(0, 40)})` : ""}`);
        results.push({
          dbId: dbProd.id,
          dbBrand: brand,
          dbName: dbProd.name,
          oyName: bestMatch?.name ?? null,
          oyUrl: bestMatch?.url ?? null,
          oyImage: bestMatch?.imageUrl ?? null,
          similarity: bestScore,
          status: "not_found",
        });
      }
    }
  }

  await browser.close();

  fs.writeFileSync(MAPPING_PATH, JSON.stringify(results, null, 2), "utf-8");

  const matched = results.filter((r) => r.status === "matched").length;
  const lowConf = results.filter((r) => r.status === "low_confidence").length;
  const notFound = results.filter((r) => r.status === "not_found").length;

  console.log(`\n=== 매칭 결과 ===`);
  console.log(`매칭 성공 (≥0.5): ${matched}건`);
  console.log(`낮은 확신 (0.4~0.5): ${lowConf}건`);
  console.log(`매칭 실패 (<0.4): ${notFound}건`);
  console.log(`결과 저장: ${MAPPING_PATH}`);
}

main().catch((err) => {
  console.error("에러:", err);
  process.exit(1);
});
