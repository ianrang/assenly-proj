"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Dropdown } from "@/client/ui/primitives/dropdown";
import { EXPLORE_REGISTRY } from "@/shared/constants/explore-registry";
import type { ExploreDomain } from "@/shared/types/explore";

type SortDropdownProps = {
  domain: ExploreDomain;
  value: string;
  onChange: (value: string) => void;
  hasProfile: boolean;
};

export default function SortDropdown({ domain, value, onChange, hasProfile }: SortDropdownProps) {
  const t = useTranslations();
  const config = EXPLORE_REGISTRY.find((d) => d.id === domain);
  if (!config) return null;

  const options = config.sortFields
    .filter((sf) => !sf.requiresProfile || hasProfile)
    .map((sf) => ({
      value: sf.value,
      label: t(sf.labelKey),
    }));

  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={t("explore.sort.label")}
    />
  );
}
