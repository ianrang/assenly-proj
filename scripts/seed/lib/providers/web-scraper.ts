// ============================================================
// Channel A-3 웹 스크래퍼 — data-collection.md §1.2 Channel A-3
// Playwright 헤드리스 브라우저로 브랜드 공식 사이트(1순위) +
// 올리브영 글로벌(2순위 보조)에서 products 기본 정보 수집.
// 올리브영 데이터는 source="scraper-oliveyoung" → Stage 3 수동검수 필수.
// P-9: scripts/ 내부 import만. server/ import 금지.
// P-7: 사이트 추가/변경 → site-configs.ts 1파일만.
// ============================================================

import { chromium, type Browser, type Page } from "playwright";
import { SITE_CONFIGS, type SiteConfig } from "./site-configs";
import type { RawRecord } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** Crawl-delay (data-collection.md: 5초 준수) */
const CRAWL_DELAY_MS = 5000;

// ── 페이지 데이터 → RawRecord 변환 ────────────────────────

/** 크롤링 결과 1건을 RawRecord로 변환 */
export function mapPageDataToRawRecord(
  data: Record<string, string>,
  url: string,
  source: string,
): RawRecord {
  return {
    source,
    sourceId: url,
    entityType: "product",
    data: { ...data, url },
    fetchedAt: new Date().toISOString(),
  };
}

// ── 내부 헬퍼 ─────────────────────────────────────────────

/** 페이지에서 CSS selector로 텍스트 추출 (없으면 빈 문자열) */
async function extractText(page: Page, selector: string): Promise<string> {
  const el = await page.$(selector);
  if (!el) return "";
  const text = await el.textContent();
  return text?.trim() ?? "";
}

/** 페이지에서 img src 추출 (없으면 빈 문자열) */
async function extractImageSrc(page: Page, selector: string): Promise<string> {
  const el = await page.$(selector);
  if (!el) return "";
  return (await el.getAttribute("src")) ?? "";
}

/** Crawl-delay 대기 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 단일 사이트 크롤링 */
async function scrapeSite(
  browser: Browser,
  config: SiteConfig,
): Promise<RawRecord[]> {
  const page = await browser.newPage();
  const results: RawRecord[] = [];

  try {
    // 제품 목록 페이지 이동
    await page.goto(`${config.baseUrl}${config.productListUrl}`, {
      waitUntil: "domcontentloaded",
    });
    await delay(CRAWL_DELAY_MS);

    // 제품 링크 수집
    const links = await page.$$eval(
      config.selectors.productLink,
      (els, baseUrl) =>
        els
          .map((el) => {
            const href = el.getAttribute("href");
            if (!href) return "";
            return href.startsWith("http") ? href : `${baseUrl}${href}`;
          })
          .filter(Boolean),
      config.baseUrl,
    );

    // 각 제품 상세 페이지 방문
    for (const productUrl of links) {
      try {
        await page.goto(productUrl, { waitUntil: "domcontentloaded" });
        await delay(CRAWL_DELAY_MS);

        const { fields } = config.selectors;
        const data: Record<string, string> = {
          name: await extractText(page, fields.name),
          brand: config.name,
        };

        if (fields.price) {
          data.price = await extractText(page, fields.price);
        }
        if (fields.category) {
          data.category = await extractText(page, fields.category);
        }
        if (fields.imageUrl) {
          data.imageUrl = await extractImageSrc(page, fields.imageUrl);
        }
        if (fields.description) {
          data.description = await extractText(page, fields.description);
        }

        const record = mapPageDataToRawRecord(data, productUrl, config.source);
        results.push(record);
      } catch {
        // 개별 제품 에러 시 해당 건만 skip (에러 격리 — data-collection.md §7.0)
      }
    }
  } finally {
    await page.close();
  }

  return results;
}

// ── 메인 함수 ─────────────────────────────────────────────

/** 전체 사이트 크롤링 → RawRecord[] */
export async function scrapeProducts(
  configs?: SiteConfig[],
): Promise<RawRecord[]> {
  const siteConfigs = configs ?? SITE_CONFIGS;
  if (siteConfigs.length === 0) return [];

  const browser = await chromium.launch({ headless: true });
  const seen = new Map<string, RawRecord>();

  try {
    for (const config of siteConfigs) {
      try {
        const records = await scrapeSite(browser, config);

        for (const record of records) {
          if (record.sourceId && !seen.has(record.sourceId)) {
            seen.set(record.sourceId, record);
          }
        }
      } catch {
        // 사이트 에러 시 해당 사이트만 skip (에러 격리 — data-collection.md §7.0)
      }
    }
  } finally {
    await browser.close();
  }

  return [...seen.values()];
}
