import type { Browser } from "playwright";

export const USD_TO_KRW = 1380;

const CRAWL_DELAY_MS = 3_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseUsdPrice(text: string): number | null {
  if (!text) return null;
  const match = text.match(/US?\$\s*([\d,.]+)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * USD_TO_KRW);
}

export interface OyPriceResult {
  price: number;
  priceOriginal: number | null;
}

export async function fetchProductPrice(
  browser: Browser,
  url: string,
): Promise<OyPriceResult | null> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await delay(CRAWL_DELAY_MS);

    const saleEl = await page.$(".price-info strong");
    const saleText = saleEl ? (await saleEl.textContent())?.trim() || "" : "";
    const price = parseUsdPrice(saleText);
    if (!price) return null;

    const origEl = await page.$(".price-info > span");
    const origText = origEl ? (await origEl.textContent())?.trim() || "" : "";
    let priceOriginal = parseUsdPrice(origText);
    if (priceOriginal && priceOriginal < price) {
      priceOriginal = price;
    }

    return { price, priceOriginal };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}
