"use client";

import "client-only";

import { useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ExploreDomain } from "@/shared/types/explore";
import type { Product, Store, Clinic, Treatment } from "@/shared/types/domain";
import ProductCard, { ProductCardSkeleton } from "@/client/features/cards/ProductCard";
import StoreCard, { StoreCardSkeleton } from "@/client/features/cards/StoreCard";
import ClinicCard, { ClinicCardSkeleton } from "@/client/features/cards/ClinicCard";
import TreatmentCard, { TreatmentCardSkeleton } from "@/client/features/cards/TreatmentCard";
import ExploreEmptyState from "./ExploreEmptyState";

type ExploreGridProps = {
  domain: ExploreDomain;
  items: Record<string, unknown>[];
  locale: string;
  isLoading: boolean;
  onResetFilters: () => void;
};

const ESTIMATE_ROW_HEIGHT = 320;
const OVERSCAN = 3;

function useColumns() {
  if (typeof window === "undefined") return 2;
  return window.innerWidth >= 1024 ? 3 : 2;
}

function renderCard(domain: ExploreDomain, item: Record<string, unknown>, locale: string) {
  const reasons = item.reasons as string[] | undefined;
  const whyRecommended = reasons?.[0];

  switch (domain) {
    case "products":
      return (
        <ProductCard
          product={item as unknown as Product}
          whyRecommended={whyRecommended}
          locale={locale}
        />
      );
    case "stores":
      return (
        <StoreCard
          store={item as unknown as Store}
          whyRecommended={whyRecommended}
          locale={locale}
        />
      );
    case "clinics":
      return (
        <ClinicCard
          clinic={item as unknown as Clinic}
          whyRecommended={whyRecommended}
          locale={locale}
        />
      );
    case "treatments":
      return (
        <TreatmentCard
          treatment={item as unknown as Treatment}
          whyRecommended={whyRecommended}
          locale={locale}
        />
      );
  }
}

function renderSkeleton(domain: ExploreDomain, count: number) {
  const Skeleton = {
    products: ProductCardSkeleton,
    stores: StoreCardSkeleton,
    clinics: ClinicCardSkeleton,
    treatments: TreatmentCardSkeleton,
  }[domain];

  return Array.from({ length: count }, (_, i) => <Skeleton key={`skel-${i}`} />);
}

export default function ExploreGrid({
  domain,
  items,
  locale,
  isLoading,
  onResetFilters,
}: ExploreGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useColumns();

  const rows = useMemo(() => {
    const result: Record<string, unknown>[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      result.push(items.slice(i, i + columns));
    }
    return result;
  }, [items, columns]);

  const measureElement = useCallback((el: HTMLElement | null) => {
    if (el) {
      virtualizer.measureElement(el);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {renderSkeleton(domain, 6)}
      </div>
    );
  }

  if (items.length === 0) {
    return <ExploreEmptyState onResetFilters={onResetFilters} />;
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="relative"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((virtualRow) => {
        const row = rows[virtualRow.index];
        return (
          <div
            key={virtualRow.key}
            ref={measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 right-0 grid grid-cols-2 gap-3 lg:grid-cols-3"
            style={{ top: `${virtualRow.start}px` }}
          >
            {row.map((item) => (
              <div key={item.id as string}>
                {renderCard(domain, item, locale)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
