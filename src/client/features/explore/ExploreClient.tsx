"use client";

import "client-only";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import Header from "@/client/features/layout/Header";
import { Button } from "@/client/ui/primitives/button";
import DomainTabs from "./DomainTabs";
import ExploreGrid from "./ExploreGrid";
import ChatLinkButton from "./ChatLinkButton";
import FilterSheet from "./FilterSheet";
import FilterChips from "./FilterChips";
import SortDropdown from "./SortDropdown";
import { useExplore } from "./use-explore";
import type { ExploreDomain } from "@/shared/types/explore";

type ExploreClientProps = {
  locale: string;
};

export default function ExploreClient({ locale }: ExploreClientProps) {
  const t = useTranslations("explore");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);

  const domain = (searchParams.get("domain") ?? "products") as ExploreDomain;
  const sort = searchParams.get("sort") ?? "rating";

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key !== "domain" && key !== "sort") {
      filters[key] = value;
    }
  }

  const { items, total, scored, hasMore, isLoading, isValidating, loadMore } = useExplore(
    domain,
    filters,
    sort,
  );

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router],
  );

  const handleDomainChange = useCallback(
    (newDomain: ExploreDomain) => {
      const params = new URLSearchParams();
      params.set("domain", newDomain);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const handleApplyFilters = useCallback(
    (newFilters: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set("domain", domain);
      if (sort !== "rating") params.set("sort", sort);
      for (const [key, value] of Object.entries(newFilters)) {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, domain, sort],
  );

  const handleRemoveChip = useCallback(
    (key: string, value?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get(key);
      if (!current || !value) {
        params.delete(key);
      } else {
        const values = current.split(",").filter((v) => v !== value);
        if (values.length === 0) {
          params.delete(key);
        } else {
          params.set(key, values.join(","));
        }
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router],
  );

  const handleSortChange = useCallback(
    (newSort: string) => {
      updateParams({ sort: newSort === "rating" ? null : newSort });
    },
    [updateParams],
  );

  const handleResetFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set("domain", domain);
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, domain]);

  const remaining = total - items.length;
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header
        maxWidth="max-w-[960px]"
        rightContent={<ChatLinkButton locale={locale} />}
      />
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-4">
        <DomainTabs activeDomain={domain} onDomainChange={handleDomainChange} />

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen(true)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="size-3.5" />
            {t("filters.title")}
            {hasFilters && (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {Object.keys(filters).length}
              </span>
            )}
          </Button>
          <SortDropdown
            domain={domain}
            value={sort}
            onChange={handleSortChange}
            hasProfile={scored}
          />
        </div>

        {hasFilters && (
          <div className="mt-2">
            <FilterChips
              domain={domain}
              filters={filters}
              onRemove={handleRemoveChip}
            />
          </div>
        )}

        <div className="mt-4">
          <ExploreGrid
            domain={domain}
            items={items}
            locale={locale}
            isLoading={isLoading}
            onResetFilters={handleResetFilters}
          />
        </div>

        {hasMore && !isLoading && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isValidating}
            >
              {isValidating
                ? t("loadMore.loading")
                : t("loadMore.button", { remaining })}
            </Button>
          </div>
        )}
      </main>

      <FilterSheet
        domain={domain}
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        currentFilters={filters}
        onApply={handleApplyFilters}
      />
    </div>
  );
}
