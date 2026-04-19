"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { EXPLORE_REGISTRY } from "@/shared/constants/explore-registry";
import type { ExploreDomain } from "@/shared/types/explore";

type FilterChipsProps = {
  domain: ExploreDomain;
  filters: Record<string, string>;
  onRemove: (key: string, value?: string) => void;
};

export default function FilterChips({ domain, filters, onRemove }: FilterChipsProps) {
  const t = useTranslations();
  const config = EXPLORE_REGISTRY.find((d) => d.id === domain);
  if (!config) return null;

  const chips: { key: string; value: string; label: string }[] = [];

  for (const [key, rawValue] of Object.entries(filters)) {
    const fieldDef = config.filterFields.find((f) => f.key === key);
    if (!fieldDef) continue;

    const values = fieldDef.type === "multi" ? rawValue.split(",") : [rawValue];
    for (const val of values) {
      const option = fieldDef.options?.find((o) => o.value === val);
      const label = option ? t(option.labelKey) : val;
      chips.push({ key, value: val, label });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.value}`}
          type="button"
          onClick={() => onRemove(chip.key, chip.value)}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}
