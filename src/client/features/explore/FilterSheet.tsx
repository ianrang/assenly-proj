"use client";

import "client-only";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from "@/client/ui/primitives/sheet";
import OptionGroup from "@/client/ui/primitives/option-group";
import { Button } from "@/client/ui/primitives/button";
import { EXPLORE_REGISTRY } from "@/shared/constants/explore-registry";
import type { ExploreDomain, FilterFieldDef } from "@/shared/types/explore";

type FilterSheetProps = {
  domain: ExploreDomain;
  open: boolean;
  onClose: () => void;
  currentFilters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
};

function getRegistryConfig(domain: ExploreDomain) {
  return EXPLORE_REGISTRY.find((d) => d.id === domain)!;
}

function FilterSheetInner({
  domain,
  currentFilters,
  onApply,
  onClose,
}: Omit<FilterSheetProps, "open">) {
  const t = useTranslations();
  const config = getRegistryConfig(domain);
  const [draft, setDraft] = useState<Record<string, string>>({ ...currentFilters });

  function handleFieldChange(field: FilterFieldDef, value: string | string[]) {
    setDraft((prev) => {
      const next = { ...prev };
      if (Array.isArray(value)) {
        if (value.length === 0) {
          delete next[field.key];
        } else {
          next[field.key] = value.join(",");
        }
      } else {
        if (!value) {
          delete next[field.key];
        } else {
          next[field.key] = value;
        }
      }
      return next;
    });
  }

  function getFieldValue(field: FilterFieldDef): string | string[] {
    const raw = draft[field.key];
    if (!raw) return field.type === "multi" ? [] : "";
    if (field.type === "multi") return raw.split(",");
    return raw;
  }

  function handleApply() {
    onApply(draft);
    onClose();
  }

  function handleReset() {
    onApply({});
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("explore.filters.title")}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <div className="flex flex-col gap-5">
          {config.filterFields.map((field) => {
            if (field.type === "range") return null;

            return (
              <div key={field.key}>
                <p className="mb-2 text-sm font-medium">{t(field.labelKey)}</p>
                <OptionGroup
                  options={
                    (field.options ?? []).map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))
                  }
                  value={getFieldValue(field)}
                  onChange={(val) => handleFieldChange(field, val)}
                  mode={field.type === "multi" ? "multiple" : "single"}
                />
              </div>
            );
          })}
        </div>
      </SheetBody>
      <SheetFooter>
        <div className="flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={handleReset}>
            {t("explore.filters.reset")}
          </Button>
          <Button className="flex-1" onClick={handleApply}>
            {t("explore.filters.apply")}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

export default function FilterSheet({
  domain,
  open,
  onClose,
  currentFilters,
  onApply,
}: FilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent>
        {open && (
          <FilterSheetInner
            domain={domain}
            currentFilters={currentFilters}
            onApply={onApply}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
