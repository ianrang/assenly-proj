import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { render, screen } from "@testing-library/react";
import TreatmentCard from "./TreatmentCard";
import type { Treatment } from "@/shared/types/domain";

function makeTreatment(overrides?: Partial<Treatment>): Treatment {
  return {
    id: "treat-1",
    name: { en: "Hydrafacial" },
    description: null,
    category: "facial",
    subcategory: null,
    target_concerns: [],
    suitable_skin_types: [],
    price: 100_000,
    price_min: 50_000,
    price_max: 200_000,
    price_currency: "KRW",
    price_source: "manual",
    range_source: "manual",
    price_updated_at: null,
    price_source_url: null,
    duration_minutes: 60,
    downtime_days: 0,
    session_count: null,
    precautions: null,
    aftercare: null,
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    images: [],
    tags: [],
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("TreatmentCard PriceTierBadge", () => {
  it("price=100000 → '$$' 티어 렌더링 (treatment thresholds: 50k/200k)", () => {
    const treatment = makeTreatment({ price: 100_000 });

    render(<TreatmentCard treatment={treatment} locale="en" />);

    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
  });

  it("price=null, price_min=50000 → '$$' fallback 렌더링", () => {
    const treatment = makeTreatment({ price: null, price_min: 50_000 });

    render(<TreatmentCard treatment={treatment} locale="en" />);

    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
  });

  it("price=null, price_min=null → PriceTierBadge 미렌더링", () => {
    const treatment = makeTreatment({ price: null, price_min: null, price_max: null });

    render(<TreatmentCard treatment={treatment} locale="en" />);

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("compact variant에서도 티어 렌더링", () => {
    const treatment = makeTreatment({ price: 100_000 });

    render(<TreatmentCard treatment={treatment} locale="en" variant="compact" />);

    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
  });
});
