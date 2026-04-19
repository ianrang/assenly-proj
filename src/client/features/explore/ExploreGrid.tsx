"use client";

import "client-only";

import type React from "react";
import { useRef, useMemo, useState, useEffect } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { ExploreDomain } from "@/shared/types/explore";
import type { Product, Store, Clinic, Treatment } from "@/shared/types/domain";
import ProductCard, { ProductCardSkeleton } from "@/client/features/cards/ProductCard";
import StoreCard, { StoreCardSkeleton } from "@/client/features/cards/StoreCard";
import ClinicCard, { ClinicCardSkeleton } from "@/client/features/cards/ClinicCard";
import TreatmentCard, { TreatmentCardSkeleton } from "@/client/features/cards/TreatmentCard";
import ExploreEmptyState from "./ExploreEmptyState";

const ESTIMATE_ROW_HEIGHT = 296;
const OVERSCAN = 3;
const LG_BREAKPOINT = "(min-width: 1024px)";

type ExploreGridProps = {
  domain: ExploreDomain;
  items: Record<string, unknown>[];
  locale: string;
  isLoading: boolean;
  onResetFilters: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isValidating?: boolean;
};

function useColumns(): number {
  const [columns, setColumns] = useState(() => {
    if (typeof window === "undefined") return 2;
    return window.matchMedia(LG_BREAKPOINT).matches ? 3 : 2;
  });

  useEffect(() => {
    const mql = window.matchMedia(LG_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setColumns(e.matches ? 3 : 2);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return columns;
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

function useVirtualRows(items: Record<string, unknown>[], columns: number) {
  "use no memo";
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const result: Record<string, unknown>[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      result.push(items.slice(i, i + columns));
    }
    return result;
  }, [items, columns]);

  // eslint-disable-next-line react-hooks/incompatible-library -- "use no memo" 지시문으로 React Compiler 메모이제이션 제외 처리 완료
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATE_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  return { scrollContainerRef, rows, virtualizer };
}

type VirtualGridProps = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  rows: Record<string, unknown>[][];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  domain: ExploreDomain;
  locale: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isValidating?: boolean;
};

function LoadMoreSentinel({ scrollRootRef, onLoadMore, isValidating }: {
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  onLoadMore: () => void;
  isValidating: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const scrollRoot = scrollRootRef.current;
    if (!el || !scrollRoot) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isValidating) onLoadMore(); },
      { root: scrollRoot, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [scrollRootRef, onLoadMore, isValidating]);

  return (
    <div ref={ref} className="flex justify-center py-6">
      {isValidating && (
        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}
    </div>
  );
}

function VirtualGrid({ scrollContainerRef, rows, virtualizer, domain, locale, onLoadMore, hasMore, isValidating }: VirtualGridProps) {
  return (
    <div
      ref={scrollContainerRef}
      data-testid="virtual-scroll-container"
      className="h-[calc(100vh-200px)] overflow-y-auto pr-2 scrollbar-thin"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <div className="grid grid-cols-2 gap-4 pb-4 lg:grid-cols-3">
              {rows[virtualRow.index].map((item) => (
                <div key={item.id as string}>
                  {renderCard(domain, item, locale)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {hasMore && onLoadMore && (
        <LoadMoreSentinel
          scrollRootRef={scrollContainerRef}
          onLoadMore={onLoadMore}
          isValidating={!!isValidating}
        />
      )}
    </div>
  );
}

export default function ExploreGrid({
  domain,
  items,
  locale,
  isLoading,
  onResetFilters,
  onLoadMore,
  hasMore,
  isValidating,
}: ExploreGridProps) {
  const columns = useColumns();
  const { scrollContainerRef, rows, virtualizer } = useVirtualRows(items, columns);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {renderSkeleton(domain, 6)}
      </div>
    );
  }

  if (items.length === 0) {
    return <ExploreEmptyState onResetFilters={onResetFilters} />;
  }

  return (
    <VirtualGrid
      scrollContainerRef={scrollContainerRef}
      rows={rows}
      virtualizer={virtualizer}
      domain={domain}
      locale={locale}
      onLoadMore={onLoadMore}
      hasMore={hasMore}
      isValidating={isValidating}
    />
  );
}
