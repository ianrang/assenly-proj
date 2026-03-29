// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Playwright mock (vi.hoisted — vi.mock factory보다 먼저 실행) ──

const { mockPage, mockBrowser } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockPage, mockBrowser };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

// setTimeout mock — delay 즉시 실행
vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
  fn();
  return 0;
}) as unknown as typeof setTimeout);

import {
  mapPageDataToRawRecord,
  scrapeProducts,
} from "./web-scraper";
import type { SiteConfig } from "./site-configs";
import { chromium } from "playwright";

// ── Fixture ───────────────────────────────────────────────

const TEST_CONFIG: SiteConfig = {
  name: "test-brand",
  baseUrl: "https://test-brand.com",
  productListUrl: "/products",
  selectors: {
    productLink: ".product a",
    fields: {
      name: "h1.name",
      price: ".price",
      category: ".breadcrumb",
      imageUrl: ".product-img img",
      description: ".desc",
    },
  },
  source: "scraper-brand",
};

const OY_CONFIG: SiteConfig = {
  ...TEST_CONFIG,
  name: "oliveyoung-global",
  baseUrl: "https://global.oliveyoung.com",
  source: "scraper-oliveyoung",
};

/** ISO 8601 형식 정규식 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── helper: page.$ mock 설정 ──────────────────────────────

function mockTextField(text: string) {
  return { textContent: vi.fn().mockResolvedValue(text) };
}

function mockImgElement(src: string) {
  return {
    textContent: vi.fn().mockResolvedValue(""),
    getAttribute: vi.fn().mockResolvedValue(src),
  };
}

// ── mapPageDataToRawRecord 테스트 ─────────────────────────

describe("mapPageDataToRawRecord", () => {
  it("정상 변환 — source, sourceId(URL), entityType, data, fetchedAt", () => {
    const data = { name: "Green Tea Serum", brand: "innisfree", price: "25000" };
    const url = "https://innisfree.com/products/green-tea-serum";

    const result = mapPageDataToRawRecord(data, url, "scraper-brand");

    expect(result.source).toBe("scraper-brand");
    expect(result.sourceId).toBe(url);
    expect(result.entityType).toBe("product");
    expect(result.data.name).toBe("Green Tea Serum");
    expect(result.data.url).toBe(url);
    expect(result.fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("source — scraper-oliveyoung 반영", () => {
    const result = mapPageDataToRawRecord({}, "https://global.oliveyoung.com/p1", "scraper-oliveyoung");

    expect(result.source).toBe("scraper-oliveyoung");
  });

  it("data에 url 필드 포함", () => {
    const result = mapPageDataToRawRecord({ name: "Serum" }, "https://test.com/p1", "scraper-brand");

    expect(result.data.url).toBe("https://test.com/p1");
    expect(result.data.name).toBe("Serum");
  });
});

// ── scrapeProducts 테스트 ─────────────────────────────────

describe("scrapeProducts", () => {
  beforeEach(() => {
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as never);
    mockBrowser.newPage.mockResolvedValue(mockPage as never);
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.$$eval.mockResolvedValue([]);
    mockPage.$.mockResolvedValue(null);
    mockPage.close.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
  });

  it("빈 설정 → 빈 배열 (브라우저 미실행)", async () => {
    const result = await scrapeProducts([]);

    expect(result).toEqual([]);
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it("Playwright 브라우저 launch + close", async () => {
    mockPage.$$eval.mockResolvedValue([]);

    await scrapeProducts([TEST_CONFIG]);

    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("제품 목록 페이지 → 제품 상세 페이지 순회", async () => {
    mockPage.$$eval.mockResolvedValueOnce([
      "https://test-brand.com/products/serum",
    ]);

    // 상세 페이지 필드 mock
    mockPage.$.mockImplementation(async (selector: string) => {
      if (selector === "h1.name") return mockTextField("Green Tea Serum");
      if (selector === ".price") return mockTextField("$25.00");
      if (selector === ".breadcrumb") return mockTextField("Skincare");
      if (selector === ".product-img img") return mockImgElement("https://img.com/1.jpg");
      if (selector === ".desc") return mockTextField("Hydrating serum");
      return null;
    });

    const result = await scrapeProducts([TEST_CONFIG]);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("scraper-brand");
    expect(result[0].sourceId).toBe("https://test-brand.com/products/serum");
    expect(result[0].data.name).toBe("Green Tea Serum");
    expect(result[0].data.brand).toBe("test-brand");
    expect(result[0].data.price).toBe("$25.00");
    expect(result[0].data.imageUrl).toBe("https://img.com/1.jpg");
  });

  it("sourceId(URL) dedup — 동일 URL 중복 제거", async () => {
    mockPage.$$eval.mockResolvedValueOnce([
      "https://test-brand.com/p1",
      "https://test-brand.com/p1",
    ]);
    mockPage.$.mockImplementation(async (selector: string) => {
      if (selector === "h1.name") return mockTextField("Serum");
      return null;
    });

    const result = await scrapeProducts([TEST_CONFIG]);

    expect(result).toHaveLength(1);
  });

  it("사이트 에러 시 해당 사이트만 skip (에러 격리)", async () => {
    mockBrowser.newPage
      .mockRejectedValueOnce(new Error("Site error"))
      .mockResolvedValueOnce(mockPage as never);

    mockPage.$$eval.mockResolvedValueOnce([]);

    const result = await scrapeProducts([TEST_CONFIG, OY_CONFIG]);

    // 첫 사이트 에러, 두 번째 사이트 정상 (빈 결과)
    expect(result).toEqual([]);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("올리브영 source 구분", async () => {
    mockPage.$$eval.mockResolvedValueOnce([
      "https://global.oliveyoung.com/product/1",
    ]);
    mockPage.$.mockImplementation(async (selector: string) => {
      if (selector === "h1.name") return mockTextField("OY Product");
      return null;
    });

    const result = await scrapeProducts([OY_CONFIG]);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("scraper-oliveyoung");
  });

  it("configs 파라미터로 커스텀 설정 전달", async () => {
    const custom: SiteConfig = {
      ...TEST_CONFIG,
      name: "custom-brand",
      baseUrl: "https://custom.com",
    };
    mockPage.$$eval.mockResolvedValueOnce([]);

    await scrapeProducts([custom]);

    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://custom.com/products",
      expect.any(Object),
    );
  });
});
