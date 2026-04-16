// ============================================================
// 올리브영 Global 카테고리별 베스트셀러 직접 수집
// 제품 상세 페이지에서 모든 데이터 추출 (이름, 브랜드, 이미지, 가격, URL)
// 기존 제품과 중복 제거 후 validated.json 형식으로 출력
//
// 실행: npx tsx scripts/seed/collect-oy-bestsellers.ts
// ============================================================

import { chromium, type Browser, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const DATA_DIR = path.join(__dirname, "data");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const NEW_PRODUCTS_PATH = path.join(DATA_DIR, "products-new-collected.json");
const CRAWL_DELAY_MS = 3_000;
const OY_BASE = "https://global.oliveyoung.com";
const USD_TO_KRW = 1380;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 카테고리별 검색 쿼리 ────────────────────────────────────

interface CategoryTarget {
  category: string;
  subcategory: string;
  queries: string[];
  need: number;
}

const TARGETS: CategoryTarget[] = [
  // skincare: 45 (총 200의 ~22%)
  { category: "skincare", subcategory: "serum", queries: ["best serum", "vitamin C serum", "hyaluronic serum", "niacinamide serum", "retinol serum"], need: 12 },
  { category: "skincare", subcategory: "moisturizer", queries: ["best moisturizer cream", "hydrating cream", "gel cream", "barrier cream"], need: 10 },
  { category: "skincare", subcategory: "eye_care", queries: ["eye cream", "eye serum", "under eye"], need: 5 },
  { category: "skincare", subcategory: "toner", queries: ["best toner", "essence toner", "exfoliating toner", "hydrating toner"], need: 6 },
  { category: "skincare", subcategory: "cleanser", queries: ["foam cleanser", "cleansing oil", "gel cleanser", "low pH cleanser"], need: 5 },
  { category: "skincare", subcategory: "sunscreen", queries: ["sunscreen SPF50", "sun cream", "UV protection"], need: 5 },
  { category: "skincare", subcategory: "mask", queries: ["sheet mask", "clay mask", "sleeping mask"], need: 2 },
  // makeup: 30
  { category: "makeup", subcategory: "cushion", queries: ["cushion foundation", "glow cushion", "matte cushion"], need: 6 },
  { category: "makeup", subcategory: "lip_tint", queries: ["lip tint", "velvet tint", "water tint", "matte tint"], need: 6 },
  { category: "makeup", subcategory: "eye_shadow", queries: ["eyeshadow palette", "eye palette", "glitter shadow"], need: 4 },
  { category: "makeup", subcategory: "mascara", queries: ["mascara", "curl mascara"], need: 3 },
  { category: "makeup", subcategory: "lip_gloss", queries: ["lip gloss", "lip oil"], need: 2 },
  { category: "makeup", subcategory: "lip_stick", queries: ["lipstick", "lip balm color"], need: 2 },
  { category: "makeup", subcategory: "eye_liner", queries: ["eyeliner", "pencil liner"], need: 2 },
  { category: "makeup", subcategory: "blush", queries: ["blush cheek", "blusher"], need: 2 },
  { category: "makeup", subcategory: "setting_powder", queries: ["setting powder", "finishing powder"], need: 1 },
  { category: "makeup", subcategory: "foundation", queries: ["foundation", "BB cream"], need: 2 },
  // haircare: 22
  { category: "haircare", subcategory: "shampoo", queries: ["best shampoo", "scalp shampoo", "anti hair loss shampoo", "moisturizing shampoo"], need: 6 },
  { category: "haircare", subcategory: "treatment", queries: ["hair treatment mask", "deep conditioning", "hair pack"], need: 5 },
  { category: "haircare", subcategory: "hair_oil", queries: ["hair oil serum", "argan oil hair"], need: 3 },
  { category: "haircare", subcategory: "hair_serum", queries: ["hair essence serum", "leave in serum"], need: 3 },
  { category: "haircare", subcategory: "hair_color", queries: ["hair color dye", "hair tint"], need: 2 },
  { category: "haircare", subcategory: "styling", queries: ["hair styling", "hair wax", "hair spray"], need: 2 },
  { category: "haircare", subcategory: "hair_essence", queries: ["leave in treatment", "hair mist"], need: 1 },
  // bodycare: 20
  { category: "bodycare", subcategory: "body_wash", queries: ["body wash", "shower gel", "body cleanser"], need: 6 },
  { category: "bodycare", subcategory: "body_lotion", queries: ["body lotion moisturizer", "body cream", "body butter"], need: 5 },
  { category: "bodycare", subcategory: "hand_cream", queries: ["hand cream", "hand lotion"], need: 4 },
  { category: "bodycare", subcategory: "body_scrub", queries: ["body scrub", "body exfoliant"], need: 3 },
  { category: "bodycare", subcategory: "body_sunscreen", queries: ["body sunscreen", "body sun cream"], need: 2 },
  // tools: 10
  { category: "tools", subcategory: "cleansing_tool", queries: ["cleansing pad", "cleansing brush", "pore brush"], need: 4 },
  { category: "tools", subcategory: "makeup_tool", queries: ["makeup sponge puff", "makeup brush set", "beauty blender"], need: 4 },
  { category: "tools", subcategory: "beauty_device", queries: ["beauty device tool", "LED mask", "facial massager"], need: 2 },
];

// ── 타입 ─────────────────────────────────────────────────────

interface CollectedProduct {
  id: string;
  brand: string;
  nameEn: string;
  nameKo: string;
  category: string;
  subcategory: string;
  imageUrl: string;
  productUrl: string;
  price: number; // KRW
  priceOriginal: number | null; // KRW (정가, 할인 시)
}

// ── 가격 파싱 ────────────────────────────────────────────────

function parseUsdPrice(text: string): number | null {
  if (!text) return null;
  const match = text.match(/US?\$\s*([\d,.]+)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * USD_TO_KRW);
}

// ── 검색 결과에서 제품 URL 수집 ──────────────────────────────

interface SearchResult {
  url: string;
  brand: string;
}

async function getSearchResults(page: Page, query: string): Promise<SearchResult[]> {
  try {
    const url = `${OY_BASE}/display/search?query=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForSelector(".unit-desc", { timeout: 10_000 }).catch(() => {});
    await delay(CRAWL_DELAY_MS);

    // 제품 URL + 브랜드를 함께 수집
    // DOM: .unit-desc > a > dl.brand-info > dt(브랜드) + dd(제품명)
    const results = await page.$$eval(
      ".unit-desc a[href*='product/detail']",
      (els: HTMLAnchorElement[]) => els.map((el) => {
        const brandEl = el.querySelector(".brand-info dt");
        return {
          url: el.href,
          brand: brandEl?.textContent?.trim() ?? "",
        };
      }).filter((r) => r.url && r.brand),
    );

    // URL 기준 중복 제거
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  } catch {
    console.log(`    ⚠ 검색 페이지 로드 실패: "${query}"`);
    return [];
  }
}

// ── 제품 상세 페이지에서 모든 데이터 추출 ────────────────────

async function extractProductDetail(
  browser: Browser,
  productUrl: string,
  brand: string,
  category: string,
  subcategory: string,
): Promise<CollectedProduct | null> {
  const page = await browser.newPage();
  try {
    await page.goto(productUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await delay(CRAWL_DELAY_MS);

    // 제품명 — page title이 가장 신뢰도 높음: "Product Name | OLIVE YOUNG Global"
    const pageTitle = await page.title();
    let nameEn = pageTitle.replace(/\s*\|\s*OLIVE YOUNG.*$/i, "").trim();
    if (!nameEn || nameEn.includes("page not found") || nameEn === "OLIVE YOUNG Global") return null;
    if (!brand) return null;

    // 이미지 (og:image)
    const ogImage = await page.$("meta[property='og:image']");
    const imageUrl = ogImage ? (await ogImage.getAttribute("content")) || "" : "";
    if (!imageUrl || !imageUrl.startsWith("https://")) return null;

    // 가격 (할인가 = strong, 정가 = span)
    const saleEl = await page.$(".price-info strong");
    const saleText = saleEl ? (await saleEl.textContent())?.trim() || "" : "";
    const price = parseUsdPrice(saleText);
    if (!price) return null; // 가격 없으면 스킵

    const origEl = await page.$(".price-info > span");
    const origText = origEl ? (await origEl.textContent())?.trim() || "" : "";
    let priceOriginal = parseUsdPrice(origText);
    // price_min <= price_max 보장
    if (priceOriginal && priceOriginal < price) {
      priceOriginal = price; // 정가가 할인가보다 낮으면 같은 값으로
    }

    // 한국어 이름 — OY Global에서는 영문만 있으므로 영문 그대로 사용
    // (실제 서비스에서는 별도 번역 파이프라인 필요)
    const nameKo = nameEn;

    // UUID 생성
    const id = crypto.createHash("md5").update(`oy-${productUrl}`).digest("hex");
    const uuid = [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20, 32)].join("-");

    return {
      id: uuid,
      brand,
      nameEn,
      nameKo,
      category,
      subcategory,
      imageUrl,
      productUrl,
      price,
      priceOriginal,
    };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

// ── ValidatedRecord 형식 변환 ────────────────────────────────

function toValidatedRecord(p: CollectedProduct) {
  return {
    entityType: "product" as const,
    data: {
      id: p.id,
      name: { en: p.nameEn, ko: p.nameKo },
      name_en: p.nameEn,
      name_ko: p.nameKo,
      brand: p.brand,
      brand_id: null,
      category: p.category,
      subcategory: p.subcategory,
      skin_types: [],
      hair_types: [],
      concerns: [],
      key_ingredients: [],
      price: p.price,
      price_min: p.price,
      price_max: p.priceOriginal ?? p.price,
      price_currency: "KRW",
      price_source: "real",
      range_source: "real",
      price_updated_at: new Date().toISOString(),
      price_source_url: p.productUrl,
      volume: null,
      purchase_links: [{ platform: "Olive Young Global", url: p.productUrl }],
      english_label: true,
      tourist_popular: false,
      is_highlighted: false,
      highlight_badge: null,
      rating: null,
      review_count: null,
      review_summary: null,
      images: [p.imageUrl],
      tags: [],
      status: "active",
    },
    isApproved: true,
    reviewedBy: "auto-collected",
  };
}

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  // 기존 제품 URL 로드 (중복 방지)
  const validated = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));
  const existingUrls = new Set<string>();
  const existingBrandNames = new Set<string>();
  validated
    .filter((r: { entityType: string }) => r.entityType === "product")
    .forEach((r: { data: { purchase_links?: Array<{ url: string }>; brand?: string; name?: { en?: string } } }) => {
      (r.data.purchase_links || []).forEach((l) => existingUrls.add(l.url));
      const key = `${(r.data.brand || "").toLowerCase()}::${(r.data.name?.en || "").toLowerCase()}`;
      existingBrandNames.add(key);
    });

  console.log(`기존 제품: ${existingUrls.size}개 URL`);

  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const collected: CollectedProduct[] = [];
  const collectedUrls = new Set<string>();
  const collectedBrandNames = new Set<string>();

  for (const target of TARGETS) {
    const needed = target.need;
    let found = 0;

    console.log(`\n=== ${target.category}/${target.subcategory} (${needed}건 필요) ===`);

    for (const query of target.queries) {
      if (found >= needed) break;

      console.log(`  검색: "${query}"`);
      const searchResults = await getSearchResults(page, query);
      console.log(`  검색 결과: ${searchResults.length}건`);

      for (const sr of searchResults) {
        if (found >= needed) break;
        if (existingUrls.has(sr.url) || collectedUrls.has(sr.url)) {
          continue; // 중복 스킵
        }

        const product = await extractProductDetail(browser, sr.url, sr.brand, target.category, target.subcategory);

        if (!product) {
          continue;
        }

        // 브랜드+이름 중복 체크
        const key = `${product.brand.toLowerCase()}::${product.nameEn.toLowerCase()}`;
        if (existingBrandNames.has(key) || collectedBrandNames.has(key)) {
          continue;
        }

        collected.push(product);
        collectedUrls.add(sr.url);
        collectedBrandNames.add(key);
        found++;

        console.log(`  ✓ [${product.brand}] ${product.nameEn} — ₩${product.price.toLocaleString()}`);
      }
    }

    if (found < needed) {
      console.log(`  ⚠ 부족: ${found}/${needed}건`);
    }
  }

  await browser.close();

  // ValidatedRecord 형식으로 변환
  const newRecords = collected.map(toValidatedRecord);

  // 저장
  fs.writeFileSync(NEW_PRODUCTS_PATH, JSON.stringify(newRecords, null, 2), "utf-8");

  // 검증 리포트
  console.log(`\n=== 수집 결과 ===`);
  console.log(`수집: ${collected.length}건`);

  const byCat: Record<string, number> = {};
  collected.forEach((p) => {
    const k = `${p.category}/${p.subcategory}`;
    byCat[k] = (byCat[k] || 0) + 1;
  });
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 필드 완전성 검증
  let allValid = true;
  for (const p of collected) {
    if (!p.brand) { console.error(`  ❌ brand 없음: ${p.nameEn}`); allValid = false; }
    if (!p.nameEn) { console.error(`  ❌ nameEn 없음: ${p.id}`); allValid = false; }
    if (!p.imageUrl) { console.error(`  ❌ imageUrl 없음: ${p.nameEn}`); allValid = false; }
    if (!p.productUrl) { console.error(`  ❌ productUrl 없음: ${p.nameEn}`); allValid = false; }
    if (!p.price || p.price <= 0) { console.error(`  ❌ price 없음: ${p.nameEn}`); allValid = false; }
  }

  if (allValid) {
    console.log(`\n✅ 전 제품 필드 완전성 검증 통과`);
  } else {
    console.log(`\n❌ 일부 제품 검증 실패 — 위 에러 확인`);
  }

  console.log(`\n저장: ${NEW_PRODUCTS_PATH}`);
}

main().catch((err) => {
  console.error("에러:", err);
  process.exit(1);
});
