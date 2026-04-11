// ============================================================
// 제품 이미지 + 구매 링크 보강 스크립트
// Olive Young Global에서 제품 검색 → 이미지 URL + 직접 제품 URL 추출
// P-9: scripts/ 내부 + shared/ import만. server/ import 금지.
//
// 실행:
//   npx tsx scripts/seed/enrich-product-links.ts --test   # 5개만 테스트
//   npx tsx scripts/seed/enrich-product-links.ts           # 전체 실행
// ============================================================

import { chromium, type Browser, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

// ── 상수 ─────────────────────────────────────────────────────

const CRAWL_DELAY_MS = 5_000;
const DATA_DIR = path.join(__dirname, "data");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const BACKUP_PATH = path.join(DATA_DIR, "products-validated.backup.json");
const FAILURES_PATH = path.join(DATA_DIR, "products-enrich-failures.json");
const OY_BASE = "https://global.oliveyoung.com";
const TEST_COUNT = 5;

// ── 타입 ─────────────────────────────────────────────────────

interface ValidatedRecord {
  entityType: string;
  data: {
    id: string;
    name: { en: string; ko: string; [key: string]: string };
    images: string[];
    purchase_links: Array<{ platform: string; url: string }> | null;
    [key: string]: unknown;
  };
  isApproved: boolean;
  [key: string]: unknown;
}

interface EnrichResult {
  status: "success" | "not_found" | "error";
  imageUrl?: string;
  productUrl?: string;
  error?: string;
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

// ── 대기 헬퍼 ────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** 검색 결과에서 최적 매칭 추출 */
async function extractBestMatch(
  page: Page,
  nameEn: string,
): Promise<{ productUrl: string; imageUrl: string | null } | null> {
  const cards = await page.$$eval(".unit-desc a[href*='product/detail']", (els: HTMLAnchorElement[]) =>
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

  // 같은 인덱스의 unit-thumb에서 이미지 추출
  const thumbs = await page.$$(".unit-thumb img");
  let imageUrl: string | null = null;
  if (thumbs[bestIdx]) {
    imageUrl = await thumbs[bestIdx].getAttribute("src");
  }

  // 이미지 못 찾으면 제품 상세 페이지에서 og:image 추출
  if (!isValidImageUrl(imageUrl)) {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await delay(CRAWL_DELAY_MS);

    const ogImage = await page.$("meta[property='og:image']");
    if (ogImage) {
      imageUrl = await ogImage.getAttribute("content");
    }
  }

  return { productUrl, imageUrl: isValidImageUrl(imageUrl) ? imageUrl : null };
}

async function searchAndEnrich(page: Page, nameEn: string, brand: string): Promise<EnrichResult> {
  try {
    // 1차 시도: 전체 영문 제품명
    const searchUrl = buildSearchUrl(nameEn);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector(".unit-desc", { timeout: 10_000 }).catch(() => {});
    await delay(CRAWL_DELAY_MS);

    let match = await extractBestMatch(page, nameEn);

    // 2차 시도: 브랜드 + 핵심 키워드 (축약)
    if (!match) {
      const shortQuery = buildShortQuery(nameEn, brand);
      if (shortQuery !== nameEn) {
        const retryUrl = buildSearchUrl(shortQuery);
        await page.goto(retryUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.waitForSelector(".unit-desc", { timeout: 10_000 }).catch(() => {});
        await delay(CRAWL_DELAY_MS);
        match = await extractBestMatch(page, nameEn);
      }
    }

    if (!match) return { status: "not_found" };

    return {
      status: "success",
      productUrl: match.productUrl,
      imageUrl: match.imageUrl ?? undefined,
    };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  const isTest = process.argv.includes("--test");

  // 데이터 로드
  if (!fs.existsSync(VALIDATED_PATH)) {
    console.error(`파일 없음: ${VALIDATED_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(VALIDATED_PATH, "utf-8");
  const records: ValidatedRecord[] = JSON.parse(raw);
  const products = records.filter((r) => r.entityType === "product");

  console.log(`총 제품: ${products.length}개`);

  // 백업 생성
  fs.copyFileSync(VALIDATED_PATH, BACKUP_PATH);
  console.log(`백업 생성: ${BACKUP_PATH}`);

  const target = isTest ? products.slice(0, TEST_COUNT) : products;
  console.log(`대상: ${target.length}개 (${isTest ? "테스트 모드" : "전체"})`);

  // 브라우저 시작
  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const failures: Array<{ id: string; name: string; reason: string }> = [];
  let successCount = 0;
  let imageCount = 0;

  for (let i = 0; i < target.length; i++) {
    const product = target[i];
    const nameEn = product.data.name.en;
    const brand = (product.data.brand as string) ?? "";
    const progress = `[${i + 1}/${target.length}]`;

    // 이미 이미지가 있는 제품은 스킵
    if (product.data.images && product.data.images.length > 0 && isValidImageUrl(product.data.images[0])) {
      console.log(`${progress} ${nameEn}... ⊘ 이미 확보됨, 스킵`);
      successCount++;
      imageCount++;
      continue;
    }

    console.log(`${progress} ${nameEn}...`);

    const result = await searchAndEnrich(page, nameEn, brand);

    if (result.status === "success") {
      successCount++;

      if (result.productUrl) {
        product.data.purchase_links = [
          { platform: "Olive Young Global", url: result.productUrl },
        ];
      }

      if (result.imageUrl && isValidImageUrl(result.imageUrl)) {
        product.data.images = [result.imageUrl];
        imageCount++;
        console.log(`  ✓ 이미지 + 링크 확보`);
      } else if (result.productUrl) {
        console.log(`  △ 링크만 확보 (이미지 없음)`);
      }
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

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
