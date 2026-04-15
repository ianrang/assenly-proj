"use client";

import "client-only";

import { Button } from "@/client/ui/primitives/button";

// ============================================================
// OptionGroup — 재사용 가능한 선택 그룹 프리미티브
// L-17: 도메인 무관(value/label 인터페이스). K-뷰티 용어 포함 금지.
// S-10: Button primitive + Tailwind 토큰만 사용.
// 단일/다중 선택 + max 제약 지원.
// ============================================================

type OptionGroupProps = {
  options: readonly { value: string; label: string }[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  mode: "single" | "multiple";
  max?: number;
};

export default function OptionGroup({ options, value, onChange, mode, max }: OptionGroupProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  function handleToggle(optionValue: string) {
    if (mode === "single") {
      onChange(selected.includes(optionValue) ? "" : optionValue);
      return;
    }
    if (selected.includes(optionValue)) {
      onChange(selected.filter((v) => v !== optionValue));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, optionValue]);
    }
  }

  const isMaxReached = mode === "multiple" && max ? selected.length >= max : false;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ value: optVal, label }) => {
        const isSelected = selected.includes(optVal);
        const isDisabled = !isSelected && isMaxReached;
        return (
          <Button
            key={optVal}
            type="button"
            variant={isSelected ? "default" : "outline"}
            size="sm"
            disabled={isDisabled}
            onClick={() => handleToggle(optVal)}
            aria-pressed={isSelected}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
