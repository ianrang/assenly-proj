// ============================================================
// 제품 이미지 + 구매 링크 + 가격 보강 스크립트
// Olive Young Global/Korea에서 제품 검색 → 이미지 URL + 제품 URL + 가격 추출
// P-9: scripts/ 내부 + shared/ import만. server/ import 금지.
//
// 개선사항:
//   - 브랜드 검증 게이트: 상세 페이지 브랜드명과 DB 브랜드 대조, 불일치 시 거부
//   - 가격 추출: 상세 페이지에서 할인가/정가 추출 (KRW 기준)
//   - 한국 OY fallback: Global 실패 시 oliveyoung.co.kr 재검색
//
// 실행:
//   npx tsx scripts/seed/enrich-product-links.ts --test   # 5개만 테스트
//   npx tsx scripts/seed/enrich-product-links.ts           # 전체 실행
//   npx tsx scripts/seed/enrich-product-links.ts --input path/to/file.json
// ============================================================

import { chromium, type Browser, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

// ── 상수 ─────────────────────────────────────────────────────

const CRAWL_DELAY_MS = 5_000;
const DATA_DIR = path.join(__dirname, "data");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const RECOVERED_PATH = path.join(DATA_DIR, "products-recovered.json");
const BACKUP_PATH = path.join(DATA_DIR, "products-validated.backup.json");
const FAILURES_PATH = path.join(DATA_DIR, "products-enrich-failures.json");
const OY_BASE = "https://global.oliveyoung.com";
const OY_KR_BASE = "https://www.oliveyoung.co.kr";
const TEST_COUNT = 5;
const USD_TO_KRW = 1380;

// ── 셀렉터 상수 (사이트 구조 변경 시 여기만 수정) ────────────

const SELECTORS_GLOBAL = {
  searchResult: ".unit-desc",
  productLink: ".unit-desc a[href*='product/detail']",
  thumbnail: ".unit-thumb img",
  brand: ".brand-name",
  priceSale: ".price-info strong",
  priceOriginal: ".price-info > span",
  priceAlt: ".price-info",
  ogImage: "meta[property='og:image']",
} as const;

const SELECTORS_KOREA = {
  searchResult: ".prd_info",
  productLink: ".prd_info a[href*='goods']",
  thumbnail: ".prd_img img",
  brand: ".prd_brand_area a",
  priceSale: ".price .tx_cur",
  priceOriginal: ".price .tx_org",
  priceAlt: ".price .prd_price",
  ogImage: "meta[property='og:image']",
} as const;

// ── 타입 ─────────────────────────────────────────────────────

interface ValidatedRecord {
  entityType: string;
  data: {
    id: string;
    name: { en: string; ko: string; [key: string]: string };
    images: string[];
    purchase_links: Array<{ platform: string; url: string }> | null;
    price?: number | null;
    price_min?: number | null;
    price_max?: number | null;
    price_currency?: string;
    price_source?: string;
    range_source?: string;
    price_source_url?: string;
    price_updated_at?: string;
    [key: string]: unknown;
  };
  isApproved: boolean;
  [key: string]: unknown;
}

interface EnrichResult {
  status: "success" | "not_found" | "error";
  imageUrl?: string;
  productUrl?: string;
  price?: number | null;
  priceOriginal?: number | null;
  source?: "global" | "korea";
  error?: string;
}

interface MatchResult {
  productUrl: string;
  imageUrl: string | null;
  price: number | null;
  priceOriginal: number | null;
}

// ── 순수 함수 (테스트 가능) ─────────────────────────────────

/** 이미지 URL 검증: https:// 시작, dist(placeholder) 아님 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return false;
  if (!url.startsWith("https://")) return false;
  if (url.includes("dist.oliveyoung.com")) return false; // 로딩 플레이스홀더 제외
  return true;
}

/** Olive Young Global 검색 URL 생성 (display/search 엔드포인트 사용) */
export function buildSearchUrl(nameEn: string): string {
  return `${OY_BASE}/display/search?query=${encodeURIComponent(nameEn)}`;
}

/**
 * 검색 쿼리 축약: 전체 이름이 실패하면 브랜드 + 핵심 키워드로 재시도.
 * "Etude Soon Jung Moist Full Collagen Cream" → "etude soon jung cream"
 */
export function buildShortQuery(nameEn: string, brand: string): string {
  // 브랜드명 제거 후 핵심 단어 추출
  const withoutBrand = nameEn.replace(new RegExp(brand, "i"), "").trim();
  const words = withoutBrand.split(/\s+/).filter(Boolean);
  // 핵심 키워드: 최대 3개 (숫자/용량 제거)
  const keywords = words
    .filter((w) => !/^\d+[gml]*$/i.test(w) && !/^(SPF|PA|EX|Set)$/i.test(w) && w.length > 1)
    .slice(0, 3);
  return `${brand} ${keywords.join(" ")}`.trim();
}

/** 상대 URL → 절대 URL 변환 */
export function resolveProductUrl(href: string | null): string | null {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  return `${OY_BASE}${href}`;
}

/** 브랜드 매칭: 특수문자 제거 후 대소문자 무시 비교 */
export function brandMatches(dbBrand: string, pageBrand: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalize(dbBrand) === normalize(pageBrand);
}

/** KRW 가격 문자열 파싱 → 정수 또는 null */
export function parseKrwPrice(text: string): number | null {
  if (!text || !text.trim()) return null;
  const cleaned = text.replace(/[₩원KRW,\s]/gi, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

// ── 대기 헬퍼 ────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 가격 추출 ────────────────────────────────────────────────

/** USD 가격 문자열 → KRW 근사 변환 */
function parseUsdToKrw(text: string): number | null {
  if (!text || !text.trim()) return null;
  // "US$12.99", "$12.99", "USD 12.99" 등 처리
  const cleaned = text.replace(/[US$USD,\s]/gi, '');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * USD_TO_KRW);
}

/** 가격 텍스트에서 KRW 또는 USD 파싱 */
function parsePriceText(text: string): number | null {
  if (!text || !text.trim()) return null;
  // KRW 우선 시도
  const krw = parseKrwPrice(text);
  if (krw) return krw;
  // USD 변환 시도
  return parseUsdToKrw(text);
}

/** 상세 페이지에서 가격 추출 (복수 셀렉터 패턴 시도) */
async function extractPriceFromPage(
  page: Page,
  selectors: typeof SELECTORS_GLOBAL | typeof SELECTORS_KOREA,
): Promise<{ price: number | null; priceOriginal: number | null }> {
  let price: number | null = null;
  let priceOriginal: number | null = null;

  try {
    // Pattern 1: 할인가 + 정가 쌍
    const saleEl = await page.$(selectors.priceSale);
    if (saleEl) {
      const saleText = await saleEl.textContent();
      price = saleText ? parsePriceText(saleText) : null;
    }

    const origEl = await page.$(selectors.priceOriginal);
    if (origEl) {
      const origText = await origEl.textContent();
      priceOriginal = origText ? parsePriceText(origText) : null;
    }

    // Pattern 2: 단일 가격 (할인가 못 찾은 경우)
    if (!price) {
      const altEl = await page.$(selectors.priceAlt);
      if (altEl) {
        const altText = await altEl.textContent();
        price = altText ? parsePriceText(altText) : null;
      }
    }

    // Pattern 3: meta 태그 가격
    if (!price) {
      const metaPrice = await page.$("meta[property='product:price:amount']");
      if (metaPrice) {
        const content = await metaPrice.getAttribute("content");
        price = content ? parsePriceText(content) : null;
      }
    }
  } catch {
    // 가격 추출 실패는 치명적이지 않음 — null 반환
  }

  return { price, priceOriginal };
}

// ── 스크래핑 ─────────────────────────────────────────────────

/** 제품명 유사도 (단어 겹침 비율). 0~1. */
function nameSimilarity(searchName: string, resultName: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const searchWords = normalize(searchName);
  const resultWords = new Set(normalize(resultName));
  if (searchWords.length === 0) return 0;
  const matches = searchWords.filter((w) => resultWords.has(w)).length;
  return matches / searchWords.length;
}

/** Global 검색 결과에서 최적 매칭 추출 + 브랜드 검증 + 가격 추출 */
async function extractBestMatch(
  page: Page,
  nameEn: string,
  expectedBrand: string,
): Promise<MatchResult | null> {
  const cards = await page.$$eval(SELECTORS_GLOBAL.productLink, (els: HTMLAnchorElement[]) =>
    els.map((el) => ({
      href: el.href,
      text: el.textContent?.trim().replace(/\s+/g, " ") ?? "",
    })),
  );

  if (cards.length === 0) return null;

  // 제품명 유사도 기반 최적 매칭
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < cards.length; i++) {
    const score = nameSimilarity(nameEn, cards[i].text);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // 유사도 25% 미만이면 매칭 실패 (축약 검색 대응으로 임계값 하향)
  if (bestScore < 0.25) return null;

  const productUrl = cards[bestIdx].href;

  // 같은 인덱스의 unit-thumb에서 이미지 추출 (폴백용)
  const thumbs = await page.$$(SELECTORS_GLOBAL.thumbnail);
  let imageUrl: string | null = null;
  if (thumbs[bestIdx]) {
    imageUrl = await thumbs[bestIdx].getAttribute("src");
  }

  // 항상 상세 페이지로 이동 — 브랜드 검증 + 가격 추출 + og:image
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await delay(CRAWL_DELAY_MS);

  // 브랜드 검증 게이트
  if (expectedBrand) {
    try {
      const brandEl = await page.$(SELECTORS_GLOBAL.brand);
      if (brandEl) {
        const pageBrand = (await brandEl.textContent())?.trim() ?? "";
        if (pageBrand && !brandMatches(expectedBrand, pageBrand)) {
          console.log(`  ⊘ 브랜드 불일치: DB="${expectedBrand}" vs 페이지="${pageBrand}"`);
          return null;
        }
      }
    } catch {
      // 브랜드 요소 못 찾으면 검증 스킵 (차단보다 허용이 낫다)
    }
  }

  // 가격 추출
  const { price, priceOriginal } = await extractPriceFromPage(page, SELECTORS_GLOBAL);

  // og:image 추출
  const ogImage = await page.$(SELECTORS_GLOBAL.ogImage);
  if (ogImage) {
    const ogUrl = await ogImage.getAttribute("content");
    if (isValidImageUrl(ogUrl)) {
      imageUrl = ogUrl;
    }
  }

  return {
    productUrl,
    imageUrl: isValidImageUrl(imageUrl) ? imageUrl : null,
    price,
    priceOriginal,
  };
}

/** 한국 OY 검색 결과에서 최적 매칭 추출 + 브랜드 검증 + 가격 추출 */
async function extractBestMatchKorea(
  page: Page,
  nameEn: string,
  expectedBrand: string,
): Promise<MatchResult | null> {
  const cards = await page.$$eval(SELECTORS_KOREA.productLink, (els: HTMLAnchorElement[]) =>
    els.map((el) => ({
      href: el.href,
      text: el.textContent?.trim().replace(/\s+/g, " ") ?? "",
    })),
  ).catch(() => [] as Array<{ href: string; text: string }>);

  if (cards.length === 0) return null;

  // 제품명 유사도 기반 최적 매칭
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < cards.length; i++) {
    const score = nameSimilarity(nameEn, cards[i].text);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore < 0.25) return null;

  let productUrl = cards[bestIdx].href;
  if (!productUrl.startsWith("http")) {
    productUrl = `${OY_KR_BASE}${productUrl}`;
  }

  // 상세 페이지로 이동 — 브랜드 검증 + 가격 추출 + og:image
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await delay(CRAWL_DELAY_MS);

  // 브랜드 검증 게이트
  if (expectedBrand) {
    try {
      const brandEl = await page.$(SELECTORS_KOREA.brand);
      if (brandEl) {
        const pageBrand = (await brandEl.textContent())?.trim() ?? "";
        if (pageBrand && !brandMatches(expectedBrand, pageBrand)) {
          console.log(`  ⊘ 브랜드 불일치 (KR): DB="${expectedBrand}" vs 페이지="${pageBrand}"`);
          return null;
        }
      }
    } catch {
      // 브랜드 요소 못 찾으면 검증 스킵
    }
  }

  // 가격 추출
  const { price, priceOriginal } = await extractPriceFromPage(page, SELECTORS_KOREA);

  // og:image 추출
  let imageUrl: string | null = null;
  const ogImage = await page.$(SELECTORS_KOREA.ogImage);
  if (ogImage) {
    const ogUrl = await ogImage.getAttribute("content");
    if (isValidImageUrl(ogUrl)) {
      imageUrl = ogUrl;
    }
  }

  return {
    productUrl,
    imageUrl,
    price,
    priceOriginal,
  };
}

async function searchAndEnrich(page: Page, nameEn: string, brand: string): Promise<EnrichResult> {
  try {
    // === GLOBAL ===
    // 1차: Global 전체 이름
    const searchUrl = buildSearchUrl(nameEn);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector(SELECTORS_GLOBAL.searchResult, { timeout: 10_000 }).catch(() => {});
    await delay(CRAWL_DELAY_MS);
    let match = await extractBestMatch(page, nameEn, brand);

    // 2차: Global 축약 검색
    if (!match) {
      const shortQuery = buildShortQuery(nameEn, brand);
      if (shortQuery !== nameEn) {
        const retryUrl = buildSearchUrl(shortQuery);
        await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.waitForSelector(SELECTORS_GLOBAL.searchResult, { timeout: 10_000 }).catch(() => {});
        await delay(CRAWL_DELAY_MS);
        match = await extractBestMatch(page, nameEn, brand);
      }
    }

    if (match) {
      return {
        status: "success",
        productUrl: match.productUrl,
        imageUrl: match.imageUrl ?? undefined,
        price: match.price,
        priceOriginal: match.priceOriginal,
        source: "global",
      };
    }

    // === KOREAN OY FALLBACK ===
    // 3차: 한국 OY 전체 이름
    const krSearchUrl = `${OY_KR_BASE}/store/search/getSearchMain.do?query=${encodeURIComponent(nameEn)}`;
    await page.goto(krSearchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector(SELECTORS_KOREA.searchResult, { timeout: 10_000 }).catch(() => {});
    await delay(CRAWL_DELAY_MS);
    match = await extractBestMatchKorea(page, nameEn, brand);

    // 4차: 한국 OY 축약 검색
    if (!match) {
      const shortQuery = buildShortQuery(nameEn, brand);
      if (shortQuery !== nameEn) {
        const krRetryUrl = `${OY_KR_BASE}/store/search/getSearchMain.do?query=${encodeURIComponent(shortQuery)}`;
        await page.goto(krRetryUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.waitForSelector(SELECTORS_KOREA.searchResult, { timeout: 10_000 }).catch(() => {});
        await delay(CRAWL_DELAY_MS);
        match = await extractBestMatchKorea(page, nameEn, brand);
      }
    }

    if (match) {
      return {
        status: "success",
        productUrl: match.productUrl,
        imageUrl: match.imageUrl ?? undefined,
        price: match.price,
        priceOriginal: match.priceOriginal,
        source: "korea",
      };
    }

    return { status: "not_found" };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  const isTest = process.argv.includes("--test");

  // --input 인자 처리
  const inputArgIdx = process.argv.indexOf("--input");
  let inputPath: string;
  if (inputArgIdx !== -1 && process.argv[inputArgIdx + 1]) {
    inputPath = process.argv[inputArgIdx + 1];
  } else if (fs.existsSync(RECOVERED_PATH)) {
    inputPath = RECOVERED_PATH;
  } else {
    inputPath = VALIDATED_PATH;
  }

  // 데이터 로드
  if (!fs.existsSync(inputPath)) {
    console.error(`파일 없음: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const records: ValidatedRecord[] = JSON.parse(raw);
  const products = records.filter((r) => r.entityType === "product");

  console.log(`입력 파일: ${inputPath}`);
  console.log(`총 제품: ${products.length}개`);

  // 백업 생성
  if (fs.existsSync(VALIDATED_PATH)) {
    fs.copyFileSync(VALIDATED_PATH, BACKUP_PATH);
    console.log(`백업 생성: ${BACKUP_PATH}`);
  }

  const target = isTest ? products.slice(0, TEST_COUNT) : products;
  console.log(`대상: ${target.length}개 (${isTest ? "테스트 모드" : "전체"})`);

  // 브라우저 시작
  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const failures: Array<{ id: string; name: string; reason: string }> = [];
  let successCount = 0;
  let imageCount = 0;
  let priceCount = 0;

  for (let i = 0; i < target.length; i++) {
    const product = target[i];
    const nameEn = product.data.name.en;
    const brand = (product.data.brand as string) ?? "";
    const progress = `[${i + 1}/${target.length}]`;

    // 이미 이미지와 가격이 모두 있는 제품은 스킵
    const hasImage = product.data.images && product.data.images.length > 0 && isValidImageUrl(product.data.images[0]);
    const hasPrice = product.data.price != null && product.data.price > 0;
    if (hasImage && hasPrice) {
      console.log(`${progress} ${nameEn}... ⊘ 이미 확보됨(이미지+가격), 스킵`);
      successCount++;
      imageCount++;
      priceCount++;
      continue;
    }

    console.log(`${progress} ${nameEn}...`);

    const result = await searchAndEnrich(page, nameEn, brand);

    if (result.status === "success") {
      successCount++;

      // 플랫폼 소스 라벨
      const platformLabel = result.source === "korea" ? "Olive Young Korea" : "Olive Young Global";

      if (result.productUrl) {
        product.data.purchase_links = [
          { platform: platformLabel, url: result.productUrl },
        ];
      }

      if (result.imageUrl && isValidImageUrl(result.imageUrl)) {
        product.data.images = [result.imageUrl];
        imageCount++;
      }

      // 가격 필드 저장 (NEW-37 schema)
      if (result.price != null) {
        product.data.price = result.price;
        product.data.price_min = result.price;
        product.data.price_max = result.priceOriginal ?? result.price;
        product.data.price_currency = "KRW";
        product.data.price_source = "real";
        product.data.range_source = "real";
        product.data.price_source_url = result.productUrl;
        product.data.price_updated_at = new Date().toISOString();
        priceCount++;
      }

      const parts: string[] = [];
      if (result.imageUrl) parts.push("이미지");
      if (result.productUrl) parts.push("링크");
      if (result.price != null) parts.push(`가격(₩${result.price.toLocaleString()})`);
      console.log(`  ✓ ${parts.join(" + ")} 확보 [${result.source}]`);
    } else {
      const reason = result.status === "not_found" ? "검색 결과 없음" : (result.error ?? "알 수 없는 에러");
      failures.push({ id: product.data.id, name: nameEn, reason });
      console.log(`  ✗ ${reason}`);
    }
  }

  await browser.close();

  // 결과 저장
  if (!isTest) {
    fs.writeFileSync(VALIDATED_PATH, JSON.stringify(records, null, 2), "utf-8");
    console.log(`\n저장 완료: ${VALIDATED_PATH}`);
  } else {
    console.log(`\n테스트 모드 — 파일 저장 건너뜀`);
  }

  if (failures.length > 0) {
    fs.writeFileSync(FAILURES_PATH, JSON.stringify(failures, null, 2), "utf-8");
    console.log(`실패 목록: ${FAILURES_PATH}`);
  }

  // 결과 요약
  console.log(`\n=== 결과 요약 ===`);
  console.log(`성공: ${successCount}/${target.length}`);
  console.log(`이미지 확보: ${imageCount}/${target.length}`);
  console.log(`가격 확보: ${priceCount}/${target.length}`);
  console.log(`실패: ${failures.length}/${target.length}`);

  if (failures.length > 0) {
    console.log(`\n실패한 제품 (수동 보강 필요):`);
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason}`);
    }
  }

  if (failures.length > target.length * 0.5) {
    console.log(`\n⚠ 실패율 50% 초과 — Cloudflare 차단 가능성. 수동 큐레이션을 권장합니다.`);
  }
}

// ESM 직접 실행 가드: npx tsx로 실행 시에만 main() 호출. 테스트 import 시 실행 안 함.
const isDirectRun = process.argv[1]?.endsWith('enrich-product-links.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error("치명적 에러:", err);
    process.exit(1);
  });
}
