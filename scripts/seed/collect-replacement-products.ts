// ============================================================
// 실패 제품 대체 수집 스크립트
// 이미지/링크 미확보 제품을 올리브영 글로벌에서 실제 판매 중인
// 동일 카테고리 제품으로 교체. 이미지+직접URL 보장.
// P-9: scripts/ 내부만. server/ import 금지.
//
// 실행:
//   npx tsx scripts/seed/collect-replacement-products.ts
// ============================================================

import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.join(__dirname, "data");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const CRAWL_DELAY_MS = 3_000;
const OY_BASE = "https://global.oliveyoung.com";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return false;
  if (!url.startsWith("https://")) return false;
  if (url.includes("dist.oliveyoung.com")) return false;
  return true;
}

interface CollectedProduct {
  name_en: string;
  brand: string;
  productUrl: string;
  imageUrl: string;
  price_usd: string | null;
  category: string;
  subcategory: string;
}

// 실패 제품의 카테고리별 필요 수량에 맞는 검색 쿼리
const CATEGORY_QUERIES: Array<{ subcategory: string; category: string; queries: string[]; need: number }> = [];

async function collectFromSearch(
  page: Page,
  query: string,
  existingUrls: Set<string>,
  maxCount: number,
): Promise<CollectedProduct[]> {
  const url = `${OY_BASE}/display/search?query=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForSelector(".unit-desc", { timeout: 10_000 }).catch(() => {});
  await delay(CRAWL_DELAY_MS);

  const cards = await page.$$eval(".unit-desc a[href*='product/detail']", (els: HTMLAnchorElement[]) =>
    els.map((el) => ({
      href: el.href,
      text: el.textContent?.trim().replace(/\s+/g, " ") ?? "",
    })),
  );

  const thumbs = await page.$$eval(".unit-thumb img", (els: HTMLImageElement[]) =>
    els.map((el) => el.src),
  );

  const results: CollectedProduct[] = [];

  for (let i = 0; i < cards.length && results.length < maxCount; i++) {
    const card = cards[i];
    const imgUrl = thumbs[i] ?? null;

    if (!card.href.includes("product/detail")) continue;
    if (!isValidImageUrl(imgUrl)) continue;
    if (existingUrls.has(card.href)) continue; // 이미 수집된 URL 제외

    // 브랜드명 추출 (텍스트의 첫 단어가 브랜드명인 패턴)
    const brandMatch = card.text.match(/^([A-Za-z\s'&.]+?)\s+\1\s/);
    const brand = brandMatch ? brandMatch[1].trim() : card.text.split(" ")[0];

    // 가격 추출
    const priceMatch = card.text.match(/US\$([0-9.]+)/);

    results.push({
      name_en: card.text.replace(/\s+\d+\.\d+\s+US\$.*$/, "").trim(), // 평점+가격 제거
      brand,
      productUrl: card.href,
      imageUrl: imgUrl!,
      price_usd: priceMatch ? priceMatch[1] : null,
      category: "", // 호출자가 설정
      subcategory: "", // 호출자가 설정
    });

    existingUrls.add(card.href);
  }

  return results;
}

async function main() {
  // 1. 현재 데이터 로드 및 실패 제품 분석
  const data = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));
  const products = data.filter((r: { entityType: string }) => r.entityType === "product");
  const noImages = products.filter((p: { data: { images: string[] } }) => !p.data.images || p.data.images.length === 0);

  // 카테고리별 필요 수량 계산
  const catNeedMap = new Map<string, { category: string; count: number }>();
  for (const p of noImages) {
    const sub = p.data.subcategory || p.data.category || "skincare";
    const cat = p.data.category || "skincare";
    const key = sub;
    if (!catNeedMap.has(key)) catNeedMap.set(key, { category: cat, count: 0 });
    catNeedMap.get(key)!.count++;
  }

  console.log("=== 대체 필요 제품 ===");
  console.log("총:", noImages.length, "개");
  [...catNeedMap.entries()].sort((a, b) => b[1].count - a[1].count).forEach(([sub, { count }]) => {
    console.log(`  ${sub}: ${count}개`);
  });

  // 카테고리 → 검색 쿼리 매핑
  const searchMap: Record<string, string[]> = {
    serum: ["best serum", "vitamin c serum", "hyaluronic serum", "niacinamide serum"],
    moisturizer: ["best moisturizer", "hydrating cream", "gel cream"],
    eye_care: ["eye cream", "eye serum"],
    cleanser: ["foam cleanser", "cleansing oil", "cleansing balm"],
    cushion: ["cushion foundation", "cushion compact"],
    shampoo: ["shampoo", "scalp shampoo"],
    body_wash: ["body wash", "shower gel"],
    sunscreen: ["sunscreen SPF", "sun cream"],
    body_lotion: ["body lotion", "body cream"],
    mask: ["sheet mask", "sleeping mask"],
    mascara: ["mascara", "lash mascara"],
    treatment: ["facial treatment", "ampoule treatment"],
    hand_cream: ["hand cream"],
    toner: ["toner", "toner pad"],
    lip_tint: ["lip tint"],
    lip_balm: ["lip balm"],
    lip_gloss: ["lip gloss"],
    lip_stick: ["lipstick"],
    foundation: ["foundation liquid"],
    eye_shadow: ["eyeshadow palette"],
    eye_liner: ["eyeliner pencil"],
    setting_powder: ["setting powder"],
    blush: ["blush cheek"],
    hair_oil: ["hair oil"],
    hair_serum: ["hair serum"],
    hair_essence: ["hair essence"],
    hair_color: ["hair color dye"],
    styling: ["hair styling"],
    body_sunscreen: ["body sunscreen"],
    application_sponge: ["makeup sponge"],
    makeup_puff: ["makeup puff"],
    makeup_sponge: ["beauty blender"],
    mask_cover: ["mask cover silicone"],
    mirror: ["compact mirror"],
    organizer: ["brush pouch"],
    body_scrub: ["body scrub"],
    cleansing_brush: ["cleansing tool"],
  };

  // 2. 기존 제품 URL 수집 (중복 방지)
  const existingUrls = new Set<string>();
  for (const p of products) {
    const links = p.data.purchase_links;
    if (links && links.length > 0) existingUrls.add(links[0].url);
  }

  // 3. 카테고리별로 대체 제품 수집
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const replacements: CollectedProduct[] = [];

  for (const [subcategory, { category, count }] of catNeedMap.entries()) {
    const queries = searchMap[subcategory] ?? [subcategory.replace(/_/g, " ")];
    let remaining = count;

    for (const query of queries) {
      if (remaining <= 0) break;

      console.log(`\n[${subcategory}] 검색: "${query}" (필요: ${remaining}개)...`);
      const found = await collectFromSearch(page, query, existingUrls, remaining);

      for (const product of found) {
        product.category = category;
        product.subcategory = subcategory;
        replacements.push(product);
        remaining--;
      }

      console.log(`  확보: ${found.length}개`);
    }

    if (remaining > 0) {
      console.log(`  ⚠ ${subcategory}: ${remaining}개 미확보`);
    }
  }

  await browser.close();

  console.log("\n=== 수집 결과 ===");
  console.log("대체 제품 확보:", replacements.length, "/", noImages.length);

  // 4. 실패 제품 교체
  let replacedCount = 0;
  let replacementIdx = 0;

  for (const record of data) {
    if (record.entityType !== "product") continue;
    if (record.data.images && record.data.images.length > 0) continue;
    if (replacementIdx >= replacements.length) break;

    const rep = replacements[replacementIdx];
    replacementIdx++;

    // 기존 제품 데이터 교체
    record.data.name = { en: rep.name_en, ko: rep.name_en }; // ko는 일단 en과 동일
    record.data.brand = rep.brand;
    record.data.category = rep.category;
    record.data.subcategory = rep.subcategory;
    record.data.images = [rep.imageUrl];
    record.data.purchase_links = [{ platform: "Olive Young Global", url: rep.productUrl }];
    if (rep.price_usd) {
      // USD → KRW 대략 변환 (1 USD ≈ 1400 KRW)
      record.data.price = Math.round(parseFloat(rep.price_usd) * 1400);
    }

    replacedCount++;
  }

  // 5. 저장
  fs.writeFileSync(VALIDATED_PATH, JSON.stringify(data, null, 2), "utf-8");
  console.log("\n교체 완료:", replacedCount, "개");
  console.log("저장:", VALIDATED_PATH);

  // 6. 최종 통계
  const finalData = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));
  const finalProducts = finalData.filter((r: { entityType: string }) => r.entityType === "product");
  const withImgs = finalProducts.filter((p: { data: { images: string[] } }) => p.data.images?.length > 0);
  const withDirectLinks = finalProducts.filter((p: { data: { purchase_links: Array<{ url: string }> } }) =>
    p.data.purchase_links?.[0]?.url?.includes("product/detail"),
  );
  const uniqueImgs = new Set(withImgs.map((p: { data: { images: string[] } }) => p.data.images[0]));

  console.log("\n=== 최종 상태 ===");
  console.log("총 제품:", finalProducts.length);
  console.log("이미지 있음:", withImgs.length);
  console.log("직접 제품 URL:", withDirectLinks.length);
  console.log("고유 이미지:", uniqueImgs.size);
}

main().catch((err) => {
  console.error("에러:", err);
  process.exit(1);
});
