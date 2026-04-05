import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { render, screen } from "@testing-library/react";
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
  it("purchase_links 배열 존재 시 Buy Online 링크 렌더링", () => {
    const product = makeProduct({
      purchase_links: [
        { platform: "coupang", url: "https://www.coupang.com/vp/products/123" },
      ],
    });

    render(<ProductCard product={product} locale="en" />);

    const link = screen.getByText("Buy Online");
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

    const links = screen.getAllByText("Buy Online");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://www.coupang.com/vp/products/123");
  });

  it("purchase_links null 시 구매 링크 미렌더링", () => {
    const product = makeProduct({ purchase_links: null });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("Buy Online")).not.toBeInTheDocument();
  });

  it("purchase_links 빈 배열 시 구매 링크 미렌더링", () => {
    const product = makeProduct({ purchase_links: [] });

    render(<ProductCard product={product} locale="en" />);

    expect(screen.queryByText("Buy Online")).not.toBeInTheDocument();
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
