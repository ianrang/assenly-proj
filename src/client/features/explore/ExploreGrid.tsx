"use client";

import "client-only";

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

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id as string}>
          {renderCard(domain, item, locale)}
        </div>
      ))}
    </div>
  );
}
