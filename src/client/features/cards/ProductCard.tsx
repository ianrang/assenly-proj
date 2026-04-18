"use client";

import "client-only";

import { useState } from "react";
import type { Product, LocalizedText } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import { computeTier } from "@/shared/utils/compute-tier";
import { formatPriceShort } from "@/shared/utils/format-price-short";
import { PRICE_TIER_CONFIG } from "@/shared/constants";
import PriceTierBadge from "@/client/ui/primitives/price-tier-badge";
import HighlightBadge from "./HighlightBadge";

type ProductCardProps = {
  product: Product;
  brand?: { name: LocalizedText } | null;
  store?: { name: LocalizedText; map_url?: string } | null;
  whyRecommended?: string;
  locale: string;
  variant?: "default" | "compact";
  /**
   * is_highlighted 상품의 "Get free kit" 액션 콜백 (v1.2 NEW-10).
   * 클릭 시 KitCtaSheet를 열어 이메일 수집 → DB 저장.
   * 미제공 시 버튼은 표시되지 않음 (방어적 기본).
   */
  onKitClaim?: () => void;
};

export default function ProductCard({ product, brand, store, whyRecommended, locale, variant = "default", onKitClaim }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = product.images[0];
  const showImage = imgSrc && !imgError;
  const isHighlighted = product.is_highlighted && product.highlight_badge !== null;
  const isCompact = variant === "compact";
  const tier = computeTier(PRICE_TIER_CONFIG.product.thresholds, product.price, product.price_min);
  const displayPrice = formatPriceShort(product.price ?? product.price_min);

  if (isCompact) {
    return (
      <article
        className={cn(
          "flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-card",
          isHighlighted ? "border-primary" : "border-border"
        )}
      >
        <div className="relative flex h-20 items-center justify-center bg-surface-warm">
          {showImage ? (
            /* eslint-disable-next-line @next/next/no-img-element -- 외부 URL 이미지, next/image 도메인 설정 별도 작업 */
            <img
              src={imgSrc}
              alt={localized(product.name, locale)}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">Image</span>
          )}
          {isHighlighted && (
            <div className="absolute left-1.5 top-1.5">
              <HighlightBadge isHighlighted={product.is_highlighted} badge={product.highlight_badge} locale={locale} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-2">
          {brand && (
            <p className="truncate text-[10px] text-muted-foreground">{localized(brand.name, locale)}</p>
          )}
          <p className="truncate text-xs font-semibold text-foreground">{localized(product.name, locale)}</p>
          {tier !== null && (
            <PriceTierBadge
              tier={tier}
              displayPrice={displayPrice}
              domain="product"
              thresholdLabel={PRICE_TIER_CONFIG.product.tooltipRange}
              showInfo={false}
              className="text-xs"
            />
          )}
          {/* v1.2 NEW-10: is_highlighted 분기로 액션 버튼 선택 */}
          {isHighlighted && onKitClaim ? (
            <button
              type="button"
              onClick={onKitClaim}
              className="mt-1.5 rounded border border-primary bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get free kit →
            </button>
          ) : product.purchase_links && product.purchase_links.length > 0 ? (
            <a
              href={product.purchase_links[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 rounded border border-border px-2 py-1 text-center text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Product Details →
            </a>
          ) : null}
        </div>
      </article>
    );
  }

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
          /* eslint-disable-next-line @next/next/no-img-element -- 외부 URL 이미지, next/image 도메인 설정 별도 작업 */
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
        {tier !== null && (
          <PriceTierBadge
            tier={tier}
            displayPrice={displayPrice}
            domain="product"
            thresholdLabel={PRICE_TIER_CONFIG.product.tooltipRange}
            showInfo
            className="mb-2 text-base"
          />
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

        {/* English Label Badge */}
        {product.english_label && (
          <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            English Label
          </span>
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

        {/* Purchase Link */}
        {product.purchase_links && product.purchase_links.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            <a
              href={product.purchase_links[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              Product Details
            </a>
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
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
