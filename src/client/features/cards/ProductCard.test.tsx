import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { render, screen, fireEvent } from "@testing-library/react";
import ProductCard from "./ProductCard";
import type { Product } from "@/shared/types/domain";

function makeProduct(overrides?: Partial<Product>): Product {
  return {
    id: "prod-1",
    name: { en: "Gentle Cleanser" },
    description: null,
    brand_id: "brand-1",
    category: "cleanser",
    subcategory: null,
    skin_types: ["dry"],
    hair_types: [],
    concerns: [],
    key_ingredients: ["centella"],
    price: 25000,
    price_min: null,
    price_max: null,
    price_currency: "KRW",
    price_source: null,
    range_source: null,
    price_updated_at: null,
    price_source_url: null,
    volume: "150ml",
    purchase_links: null,
    english_label: true,
    tourist_popular: false,
    is_highlighted: false,
    highlight_badge: null,
    rating: 4.5,
    review_count: 120,
    review_summary: null,
    images: [],
    tags: [],
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProductCard purchase_links", () => {
  it("purchase_links 배열 존재 시 Product Details 링크 렌더링", () => {
    const product = makeProduct({
      purchase_links: [
        { platform: "coupang", url: "https://www.coupang.com/vp/products/123" },
      ],
    });

    render(<ProductCard product={product} locale="en" />);

    const link = screen.getByText("Product Details");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://www.coupang.com/vp/products/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("purchase_links 다수 시 첫 번째만 렌더링", () => {
    const product = makeProduct({
      purchase_links: [
        { platform: "coupang", url: "https://www.coupang.com/vp/products/123" },
        { platform: "amazon", url: "https://www.amazon.com/dp/B0FT27QPGP" },
      ],
    });

    render(<ProductCard product={product} locale="en" />);

    const links = screen.getAllByText("Product Details");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://www.coupang.com/vp/products/123");
  });

  it("purchase_links null 시 구매 링크 미렌더링", () => {
    const product = makeProduct({ purchase_links: null });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("Product Details")).not.toBeInTheDocument();
  });

  it("purchase_links 빈 배열 시 구매 링크 미렌더링", () => {
    const product = makeProduct({ purchase_links: [] });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("Product Details")).not.toBeInTheDocument();
  });
});

describe("ProductCard english_label", () => {
  it("english_label true 시 English Label 배지 렌더링", () => {
    const product = makeProduct({ english_label: true });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.getByText("English Label")).toBeInTheDocument();
  });

  it("english_label false 시 배지 미렌더링", () => {
    const product = makeProduct({ english_label: false });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("English Label")).not.toBeInTheDocument();
  });
});

describe("ProductCard store map_url", () => {
  it("store with map_url → 매장명 클릭 링크 렌더링", () => {
    const product = makeProduct({ english_label: false });
    const store = { name: { en: "Olive Young Myeongdong" }, map_url: "http://place.map.kakao.com/123" };

    render(<ProductCard product={product} store={store} locale="en" />);

    const link = screen.getByText("Olive Young Myeongdong");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "http://place.map.kakao.com/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("store without map_url → 매장명 plain text 렌더링", () => {
    const product = makeProduct({ english_label: false });
    const store = { name: { en: "Olive Young Gangnam" } };

    render(<ProductCard product={product} store={store} locale="en" />);

    const text = screen.getByText("Olive Young Gangnam");
    expect(text.tagName).not.toBe("A");
  });

  it("store 미제공 → store 영역 미렌더링", () => {
    const product = makeProduct({ english_label: false });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("Olive Young")).not.toBeInTheDocument();
  });
});

describe("ProductCard compact variant", () => {
  it("compact 렌더 시 이름과 가격 표시", () => {
    const product = makeProduct({ name: { en: "Snail Mucin" }, price: 18000 });

    render(<ProductCard product={product} locale="en" variant="compact" />);

    expect(screen.getByText("Snail Mucin")).toBeInTheDocument();
    expect(screen.getByText("₩18,000")).toBeInTheDocument();
  });

  it("compact 렌더 시 브랜드 표시", () => {
    const product = makeProduct();
    const brand = { name: { en: "COSRX" } };

    render(<ProductCard product={product} brand={brand} locale="en" variant="compact" />);

    expect(screen.getByText("COSRX")).toBeInTheDocument();
  });

  // v1.2 NEW-10: compact variant도 Product Details 링크 + is_highlighted 시 Get free kit 표시.
  it("compact 렌더 시 tags/english_label/store는 여전히 미표시", () => {
    const product = makeProduct({
      tags: ["hydrating", "gentle"],
      english_label: true,
    });
    const store = { name: { en: "Olive Young" }, map_url: "http://map.kakao.com/123" };

    render(<ProductCard product={product} store={store} locale="en" variant="compact" />);

    expect(screen.queryByText("hydrating")).not.toBeInTheDocument();
    expect(screen.queryByText("English Label")).not.toBeInTheDocument();
    expect(screen.queryByText("Olive Young")).not.toBeInTheDocument();
  });

  it("variant 미지정 시 default 동작 (Product Details 표시)", () => {
    const product = makeProduct({
      purchase_links: [{ platform: "coupang", url: "https://coupang.com" }],
    });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.getByText("Product Details")).toBeInTheDocument();
  });
});

// v1.2 NEW-10: Kit CTA 통합 카드 테스트
describe("ProductCard Kit CTA integration (v1.2 NEW-10)", () => {
  it("compact + is_highlighted + onKitClaim → Get free kit 버튼 렌더링", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
    });
    const onKitClaim = vi.fn();

    render(
      <ProductCard
        product={product}
        locale="en"
        variant="compact"
        onKitClaim={onKitClaim}
      />
    );

    const kitButton = screen.getByRole("button", { name: /Get free kit/i });
    expect(kitButton).toBeInTheDocument();
  });

  it("compact + is_highlighted → onKitClaim 콜백 호출 가능", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
    });
    const onKitClaim = vi.fn();

    render(
      <ProductCard
        product={product}
        locale="en"
        variant="compact"
        onKitClaim={onKitClaim}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Get free kit/i }));
    expect(onKitClaim).toHaveBeenCalledTimes(1);
  });

  it("compact + !is_highlighted + purchase_links → Product Details 링크 (Get free kit 미표시)", () => {
    const product = makeProduct({
      is_highlighted: false,
      purchase_links: [{ platform: "coupang", url: "https://coupang.com/p/123" }],
    });

    render(
      <ProductCard product={product} locale="en" variant="compact" onKitClaim={() => {}} />
    );

    expect(screen.getByRole("link", { name: /Product Details/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get free kit/i })).not.toBeInTheDocument();
  });

  it("compact + is_highlighted + onKitClaim 미제공 → 버튼 미렌더링 (방어적 기본)", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
      purchase_links: [{ platform: "coupang", url: "https://coupang.com/p/123" }],
    });

    render(<ProductCard product={product} locale="en" variant="compact" />);

    // onKitClaim 미제공 시 Get free kit 버튼 없음. 대신 purchase_links가 있으면 Product Details 폴백.
    expect(screen.queryByRole("button", { name: /Get free kit/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Product Details/i })).toBeInTheDocument();
  });

  it("compact + !is_highlighted + 링크 없음 → 액션 버튼 없음", () => {
    const product = makeProduct({
      is_highlighted: false,
      purchase_links: null,
    });

    render(<ProductCard product={product} locale="en" variant="compact" />);

    expect(screen.queryByRole("button", { name: /Get free kit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Product Details/i })).not.toBeInTheDocument();
  });

  it("default variant + is_highlighted + onKitClaim → Get free kit 미노출 (compact 전용 설계)", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
      purchase_links: [{ platform: "coupang", url: "https://coupang.com/p/123" }],
    });
    const onKitClaim = vi.fn();

    // variant 미지정 = default
    render(
      <ProductCard
        product={product}
        locale="en"
        onKitClaim={onKitClaim}
      />
    );

    // default variant에서는 Get free kit 버튼이 없음 — compact 전용 설계
    expect(screen.queryByRole("button", { name: /Get free kit/i })).not.toBeInTheDocument();
    // border-primary 강조와 HighlightBadge는 표시됨
    expect(screen.getByText("Product Details")).toBeInTheDocument();
  });
});
