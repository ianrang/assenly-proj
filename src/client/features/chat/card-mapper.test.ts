import { describe, it, expect, vi } from "vitest";
vi.mock("client-only", () => ({}));

import { mapUIMessageToParts } from "./card-mapper";
import type { UIPartLike, ProductCardPart, TreatmentCardPart } from "./card-mapper";

// --- Test Fixtures ---

function makeProduct(overrides?: Record<string, unknown>) {
  return {
    id: "prod-1",
    name: { en: "Gentle Cleanser" },
    description: null,
    brand_id: "brand-1",
    category: "cleanser",
    subcategory: null,
    skin_types: ["dry" as const],
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

function makeTreatment(overrides?: Record<string, unknown>) {
  return {
    id: "treat-1",
    name: { en: "Laser Toning" },
    description: null,
    category: "laser",
    subcategory: null,
    target_concerns: ["dark_spots" as const],
    suitable_skin_types: ["combination" as const],
    price_min: 80000,
    price_max: 150000,
    price_currency: "KRW",
    duration_minutes: 30,
    downtime_days: 1,
    session_count: "3-5",
    precautions: null,
    aftercare: null,
    is_highlighted: false,
    highlight_badge: null,
    rating: 4.7,
    review_count: 50,
    images: [],
    tags: [],
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeToolPart(
  toolName: string,
  output: unknown,
  state: string = "output-available",
  domain?: string,
): UIPartLike {
  return {
    type: `tool-${toolName}`,
    state,
    input: domain ? { domain } : undefined,
    output,
  };
}

// --- Tests ---

describe("mapUIMessageToParts", () => {
  it("text-only message → text parts only", () => {
    const parts: UIPartLike[] = [{ type: "text", text: "Hello world" }];
    const result = mapUIMessageToParts(parts);

    expect(result).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("shopping tool-result → product-card parts", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [
        {
          ...product,
          reasons: ["Great for dry skin"],
          stores: [
            { id: "s1", name: { en: "Olive Young Myeongdong" }, district: "Jung-gu", english_support: "full", store_type: "flagship", rating: 4.3 },
          ],
        },
      ],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "product-card",
      product: expect.objectContaining({ id: "prod-1", name: { en: "Gentle Cleanser" } }),
      brand: null,
      store: { name: { en: "Olive Young Myeongdong" } },
      whyRecommended: "Great for dry skin",
    });
    // brand must be null (search-handler doesn't join brand)
    expect((result[0] as { brand: unknown }).brand).toBeNull();
    // store: name + map_url only (no id, no district). external_links 미제공 시 map_url undefined
    const store = (result[0] as ProductCardPart).store;
    expect(store?.name).toEqual({ en: "Olive Young Myeongdong" });
    expect(store?.map_url).toBeUndefined();
    // product must not have reasons or stores
    const productCard = result[0] as unknown as ProductCardPart;
    expect(productCard.product).not.toHaveProperty("reasons");
    expect(productCard.product).not.toHaveProperty("stores");
  });

  it("treatment tool-result → treatment-card parts with clinic booking_url", () => {
    const treatment = makeTreatment();
    const toolOutput = {
      cards: [
        {
          ...treatment,
          reasons: ["Effective for dark spots"],
          clinics: [
            { id: "c1", name: { en: "Seoul Beauty Clinic" }, district: "Gangnam", english_support: "full", clinic_type: "dermatology", rating: 4.8, booking_url: "https://booking.example.com" },
          ],
        },
      ],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "treatment")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "treatment-card",
      treatment: expect.objectContaining({ id: "treat-1", name: { en: "Laser Toning" } }),
      clinic: { name: { en: "Seoul Beauty Clinic" }, booking_url: "https://booking.example.com" },
      whyRecommended: "Effective for dark spots",
    });
    // treatment must not have reasons or clinics
    const treatmentCard = result[0] as unknown as TreatmentCardPart;
    expect(treatmentCard.treatment).not.toHaveProperty("reasons");
    expect(treatmentCard.treatment).not.toHaveProperty("clinics");
  });

  it("extract_user_profile tool → filtered out", () => {
    const parts: UIPartLike[] = [
      { type: "text", text: "Let me check" },
      makeToolPart("extract_user_profile", { profile: {} }),
    ];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "text", text: "Let me check" });
  });

  it("get_external_links tool → filtered out", () => {
    const parts: UIPartLike[] = [
      makeToolPart("get_external_links", { links: [] }),
    ];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(0);
  });

  it("tool state not output-available → ignored", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [{ ...product, reasons: ["reason"], stores: [] }],
      total: 1,
    };

    const parts: UIPartLike[] = [
      makeToolPart("search_beauty_data", toolOutput, "pending", "shopping"),
    ];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(0);
  });

  it("multiple cards in one tool-result → multiple card parts", () => {
    const product1 = makeProduct({ id: "prod-1" });
    const product2 = makeProduct({ id: "prod-2", name: { en: "Toner" } });
    const toolOutput = {
      cards: [
        { ...product1, reasons: ["reason1"], stores: [] },
        { ...product2, reasons: ["reason2"], stores: [{ id: "s1", name: { en: "Store A" }, district: null, english_support: "basic", store_type: null, rating: null }] },
      ],
      total: 2,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(2);
    expect((result[0] as { product: { id: string } }).product.id).toBe("prod-1");
    expect((result[0] as { store: unknown }).store).toBeNull();
    expect((result[1] as { product: { id: string } }).product.id).toBe("prod-2");
    expect((result[1] as ProductCardPart).store?.name).toEqual({ en: "Store A" });
  });

  it("output 형식 불량 (null, cards 미존재) → 무시", () => {
    const nullOutput: UIPartLike[] = [
      makeToolPart("search_beauty_data", null, "output-available", "shopping"),
    ];
    expect(mapUIMessageToParts(nullOutput)).toHaveLength(0);

    const noCards: UIPartLike[] = [
      makeToolPart("search_beauty_data", { total: 1 }, "output-available", "shopping"),
    ];
    expect(mapUIMessageToParts(noCards)).toHaveLength(0);
  });

  it("domain undefined → 카드 미생성", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [{ ...product, reasons: ["reason"], stores: [] }],
      total: 1,
    };

    // domain 미전달
    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput)];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(0);
  });

  it("treatment clinics 빈 배열 → clinic: null", () => {
    const treatment = makeTreatment();
    const toolOutput = {
      cards: [{ ...treatment, reasons: ["reason"], clinics: [] }],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "treatment")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("treatment-card");
    if (result[0].type !== "treatment-card") throw new Error("unreachable");
    expect(result[0].clinic).toBeNull();
    expect(result[0].whyRecommended).toBe("reason");
  });

  it("highlighted product → product-card + kit-cta-card", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
    });
    const toolOutput = {
      cards: [{ ...product, reasons: ["Top pick"], stores: [] }],
      total: 1,
    };

    const parts: UIPartLike[] = [
      makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping"),
    ];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("product-card");
    expect(result[1].type).toBe("kit-cta-card");
    if (result[1].type !== "kit-cta-card") throw new Error("unreachable");
    expect(result[1].productName).toEqual({ en: "Gentle Cleanser" });
    expect(result[1].highlightBadge).toEqual({ en: "Essenly Pick" });
  });

  it("is_highlighted but highlight_badge null → no kit-cta-card", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: null,
    });
    const toolOutput = {
      cards: [{ ...product, reasons: ["reason"], stores: [] }],
      total: 1,
    };

    const parts: UIPartLike[] = [
      makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping"),
    ];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("product-card");
  });

  it("store with external_links → map_url extracted", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [
        {
          ...product,
          reasons: ["reason"],
          stores: [
            {
              id: "s1",
              name: { en: "Olive Young" },
              district: null,
              english_support: "full",
              store_type: null,
              rating: null,
              external_links: [{ type: "kakao_map", url: "http://place.map.kakao.com/123" }],
            },
          ],
        },
      ],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    const card = result[0] as ProductCardPart;
    expect(card.store?.map_url).toBe("http://place.map.kakao.com/123");
  });

  it("store with external_links but no map type → map_url undefined", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [
        {
          ...product,
          reasons: ["reason"],
          stores: [
            {
              id: "s1",
              name: { en: "Store" },
              district: null,
              english_support: "none",
              store_type: null,
              rating: null,
              external_links: [{ type: "website", url: "https://example.com" }],
            },
          ],
        },
      ],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    const card = result[0] as ProductCardPart;
    expect(card.store?.map_url).toBeUndefined();
  });

  it("store with external_links null → map_url undefined", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [
        {
          ...product,
          reasons: ["reason"],
          stores: [
            {
              id: "s1",
              name: { en: "Store" },
              district: null,
              english_support: "none",
              store_type: null,
              rating: null,
              external_links: null,
            },
          ],
        },
      ],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    const card = result[0] as ProductCardPart;
    expect(card.store?.map_url).toBeUndefined();
  });

  it("empty reasons → whyRecommended undefined", () => {
    const product = makeProduct();
    const toolOutput = {
      cards: [{ ...product, reasons: [], stores: [] }],
      total: 1,
    };

    const parts: UIPartLike[] = [makeToolPart("search_beauty_data", toolOutput, "output-available", "shopping")];
    const result = mapUIMessageToParts(parts);

    expect(result).toHaveLength(1);
    expect((result[0] as { whyRecommended: unknown }).whyRecommended).toBeUndefined();
  });
});
