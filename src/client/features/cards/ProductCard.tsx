"use client";

import "client-only";

import { useState } from "react";
import type { Product, LocalizedText } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import HighlightBadge from "./HighlightBadge";

type ProductCardProps = {
  product: Product;
  brand?: { name: LocalizedText } | null;
  store?: { name: LocalizedText; map_url?: string } | null;
  whyRecommended?: string;
  locale: string;
};

function formatPrice(price: number | null): string {
  if (price === null) return "";
  return `₩${price.toLocaleString()}`;
}

export default function ProductCard({ product, brand, store, whyRecommended, locale }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = product.images[0];
  const showImage = imgSrc && !imgError;
  const isHighlighted = product.is_highlighted && product.highlight_badge !== null;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        isHighlighted ? "border-primary" : "border-border hover:border-primary/50"
      )}
    >
      {/* Image */}
      <div className="relative flex h-40 items-center justify-center bg-surface-warm">
        {showImage ? (
          <img
            src={imgSrc}
            alt={localized(product.name, locale)}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Product Image</span>
        )}
        {isHighlighted && (
          <div className="absolute left-2 top-2">
            <HighlightBadge
              isHighlighted={product.is_highlighted}
              badge={product.highlight_badge}
              locale={locale}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {brand && (
          <p className="mb-1 text-xs text-muted-foreground">
            {localized(brand.name, locale)}
          </p>
        )}
        <p className="mb-1 text-sm font-semibold text-foreground">
          {localized(product.name, locale)}
        </p>
        {product.price !== null && (
          <p className="mb-2 text-base font-bold text-primary">
            {formatPrice(product.price)}
          </p>
        )}
        {whyRecommended && (
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {whyRecommended}
          </p>
        )}

        {/* Tags */}
        {product.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {product.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Store */}
        {store && (
          <p className="text-[10px] text-muted-foreground">
            {store.map_url ? (
              <a
                href={store.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-foreground"
              >
                {localized(store.name, locale)}
              </a>
            ) : (
              localized(store.name, locale)
            )}
          </p>
        )}
      </div>
    </article>
  );
}

/** Skeleton placeholder for loading state */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="mb-2 h-3 w-20" />
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-3 h-5 w-16" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
