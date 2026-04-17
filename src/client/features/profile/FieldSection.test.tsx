import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import FieldSection from "./FieldSection";
import { EDITABLE_FIELDS } from "./edit-fields-registry";
import enMessages from "../../../../messages/en.json";

// ============================================================
// NEW-17d Task 20: FieldSection unit test.
// chip-multi (count/max 배지) · chip-single (no 배지) · onChange 전파 · max 도달 시 비선택 칩 비활성.
// i18n 실제 값 사용 (en.json): skinType_combination = "Combo" (Combination 아님).
// ============================================================

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages as Record<string, unknown>}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FieldSection", () => {
  it("renders chip-multi with count/max badge", () => {
    const skinTypes = EDITABLE_FIELDS.find((f) => f.key === "skin_types")!;
    const onChange = vi.fn();
    renderWithIntl(
      <FieldSection def={skinTypes} value={["dry"]} onChange={onChange} />,
    );
    // sectionLabelKey → profile.skinType = "Skin Type" + "(1/3)"
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Dry$/i })).toBeInTheDocument();
  });

  it("renders chip-single without count badge", () => {
    const hairType = EDITABLE_FIELDS.find((f) => f.key === "hair_type")!;
    const onChange = vi.fn();
    renderWithIntl(
      <FieldSection def={hairType} value="straight" onChange={onChange} />,
    );
    // scalar 는 (N/M) 배지 없음
    expect(screen.queryByText(/\/\d/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Straight$/i })).toBeInTheDocument();
  });

  it("invokes onChange when chip clicked (multi)", () => {
    const skinTypes = EDITABLE_FIELDS.find((f) => f.key === "skin_types")!;
    const onChange = vi.fn();
    renderWithIntl(
      <FieldSection def={skinTypes} value={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Oily$/i }));
    expect(onChange).toHaveBeenCalledWith(["oily"]);
  });

  it("invokes onChange with empty string when chip deselected (single)", () => {
    const hairType = EDITABLE_FIELDS.find((f) => f.key === "hair_type")!;
    const onChange = vi.fn();
    renderWithIntl(
      <FieldSection def={hairType} value="straight" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Straight$/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("disables remaining chips when max reached (array)", () => {
    const skinTypes = EDITABLE_FIELDS.find((f) => f.key === "skin_types")!;
    const onChange = vi.fn();
    // max=3 도달. "combination"(=Combo) 은 비선택 → disabled 기대.
    renderWithIntl(
      <FieldSection
        def={skinTypes}
        value={["dry", "oily", "sensitive"]}
        onChange={onChange}
      />,
    );
    // en.json: skinType_combination → "Combo"
    const comboBtn = screen.getByRole("button", { name: /^Combo$/i });
    expect(comboBtn).toBeDisabled();
  });
});
