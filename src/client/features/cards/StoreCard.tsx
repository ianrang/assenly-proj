"use client";

import "client-only";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { Store } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import HighlightBadge from "./HighlightBadge";
import { extractMapUrl } from "./map-utils";

type StoreCardProps = {
  store: Store;
  whyRecommended?: string;
  locale: string;
  variant?: "default" | "compact";
};

function extractWebsiteUrl(links: Store["external_links"]): string | undefined {
  if (!links) return undefined;
  const webLink = links.find((l) => l.type === "website" || l.type === "instagram");
  return webLink?.url;
}

export default function StoreCard({ store, whyRecommended, locale, variant = "default" }: StoreCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = store.images[0];
  const showImage = imgSrc && !imgError;
  const isHighlighted = store.is_highlighted && store.highlight_badge !== null;
  const isCompact = variant === "compact";
  const mapUrl = extractMapUrl(store.external_links);

  if (isCompact) {
    return (
      <article
        className={cn(
          "w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-card p-2.5",
          isHighlighted ? "border-primary" : "border-border"
        )}
      >
        <div className="mb-1 flex items-start justify-between gap-1">
          {store.store_type && (
            <span className="truncate rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {store.store_type}
            </span>
          )}
          {isHighlighted && (
            <HighlightBadge isHighlighted={store.is_highlighted} badge={store.highlight_badge} locale={locale} />
          )}
        </div>
        <p className="truncate text-xs font-semibold text-foreground">{localized(store.name, locale)}</p>
        {store.district && (
          <p className="truncate text-[10px] text-muted-foreground">{store.district}</p>
        )}
        {store.english_support && store.english_support !== "none" && (
          <span className="mt-1 inline-block w-fit rounded-full border border-teal bg-teal/10 px-1.5 py-0.5 text-[9px] font-medium text-teal">
            EN: {store.english_support}
          </span>
        )}
        {store.rating !== null && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{"★"} {store.rating.toFixed(1)}</p>
        )}
        {mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 rounded border border-border px-2 py-1 text-center text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            View on Map →
          </a>
        )}
      </article>
    );
  }

  const websiteUrl = extractWebsiteUrl(store.external_links);
  const primaryUrl = mapUrl ?? websiteUrl;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        isHighlighted ? "border-primary" : "border-border hover:border-primary/50"
      )}
    >
      <div className={cn(
        "relative flex h-40 items-center justify-center",
        showImage ? "bg-surface-warm" : "bg-gradient-to-br from-teal/10 via-surface-warm to-sage/10"
      )}>
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element -- 외부 URL 이미지, next/image 도메인 설정 별도 작업 */
          <img
            src={imgSrc}
            alt={localized(store.name, locale)}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <ShoppingBag className="size-10 text-teal/30" />
        )}
        {isHighlighted && (
          <div className="absolute left-2 top-2">
            <HighlightBadge isHighlighted={store.is_highlighted} badge={store.highlight_badge} locale={locale} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {store.store_type && (
          <span className="mb-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {store.store_type}
          </span>
        )}
        <p className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">{localized(store.name, locale)}</p>
        {store.district && <p className="mb-1 text-xs text-muted-foreground">{store.district}</p>}
        {whyRecommended && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{whyRecommended}</p>}

        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {store.english_support && store.english_support !== "none" && (
            <span className="rounded-full border border-teal bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">EN: {store.english_support}</span>
          )}
          {store.rating !== null && <span>{"★"} {store.rating.toFixed(1)}</span>}
        </div>

        {store.tourist_services.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {store.tourist_services.slice(0, 3).map((service) => (
              <span key={service} className="rounded-full border border-teal bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">{service}</span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          {primaryUrl && (
            <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground underline transition-colors hover:text-foreground after:absolute after:inset-0 after:content-['']">{mapUrl ? "Map" : "Website"}</a>
          )}
          {mapUrl && websiteUrl && (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="relative z-10 text-[10px] text-muted-foreground underline transition-colors hover:text-foreground">Website</a>
          )}
        </div>
      </div>
    </article>
  );
}

export function StoreCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-3 h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
