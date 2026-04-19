"use client";

import "client-only";

import type { Treatment, LocalizedText } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import { computeTier } from "@/shared/utils/compute-tier";
import { PRICE_TIER_CONFIG, INTERNAL_TAG_PREFIXES } from "@/shared/constants";
import PriceTierBadge from "@/client/ui/primitives/price-tier-badge";
import HighlightBadge from "./HighlightBadge";

type TreatmentCardProps = {
  treatment: Treatment;
  clinic?: { name: LocalizedText; booking_url?: string | null } | null;
  whyRecommended?: string;
  stayDays?: number | null;
  locale: string;
  variant?: "default" | "compact";
};

export default function TreatmentCard({ treatment, clinic, whyRecommended, stayDays, locale, variant = "default" }: TreatmentCardProps) {
  const isHighlighted = treatment.is_highlighted && treatment.highlight_badge !== null;
  const isCompact = variant === "compact";
  const tier = computeTier(PRICE_TIER_CONFIG.treatment.thresholds, treatment.price, treatment.price_min);
  const displayTags = treatment.tags
    .filter(t => !INTERNAL_TAG_PREFIXES.some(p => t.startsWith(p)))
    .slice(0, 3);

  if (isCompact) {
    return (
      <article
        className={cn(
          "w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-card p-2.5",
          isHighlighted ? "border-primary" : "border-border"
        )}
      >
        <div className="mb-1 flex items-start justify-between gap-1">
          {treatment.category && (
            <span className="truncate rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {treatment.category}
            </span>
          )}
          {isHighlighted && (
            <HighlightBadge isHighlighted={treatment.is_highlighted} badge={treatment.highlight_badge} locale={locale} />
          )}
        </div>
        <p className="truncate text-xs font-semibold text-foreground">{localized(treatment.name, locale)}</p>
        {tier !== null && (
          <PriceTierBadge
            tier={tier}
            domain="treatment"
            thresholdLabel={PRICE_TIER_CONFIG.treatment.tooltipRange}
            showInfo={false}
            className="text-xs"
          />
        )}
        {treatment.duration_minutes && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {treatment.duration_minutes}min{treatment.downtime_days !== null && treatment.downtime_days > 0 ? ` · ${treatment.downtime_days}d rec.` : ""}
          </p>
        )}
        {clinic?.booking_url && (
          <a
            href={clinic.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 rounded border border-border px-2 py-1 text-center text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Book →
          </a>
        )}
      </article>
    );
  }

  const downtimeWarning = stayDays !== null && stayDays !== undefined && treatment.downtime_days !== null && treatment.downtime_days > 0
    ? treatment.downtime_days >= stayDays * 0.5
    : false;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 transition-colors",
        isHighlighted ? "border-primary" : "border-border hover:border-primary/50"
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          {treatment.category && (
            <span className="mb-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {treatment.category}
            </span>
          )}
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {localized(treatment.name, locale)}
          </p>
        </div>
        {isHighlighted && (
          <HighlightBadge
            isHighlighted={treatment.is_highlighted}
            badge={treatment.highlight_badge}
            locale={locale}
          />
        )}
      </div>

      {/* Price Range */}
      {tier !== null && (
        <PriceTierBadge
          tier={tier}
          domain="treatment"
          thresholdLabel={PRICE_TIER_CONFIG.treatment.tooltipRange}
          showInfo
          className="mb-2 text-base"
        />
      )}

      {/* AI Recommendation */}
      {whyRecommended && (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          {whyRecommended}
        </p>
      )}

      {/* Duration + Downtime */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {treatment.duration_minutes && (
          <span>{treatment.duration_minutes} min</span>
        )}
        {treatment.downtime_days !== null && treatment.downtime_days > 0 && (
          <span className="rounded-full border border-coral px-2 py-0.5 text-[10px] font-medium text-coral">
            {treatment.downtime_days}-day recovery
          </span>
        )}
        {treatment.downtime_days === 0 && (
          <span className="rounded-full border border-sage bg-sage/10 px-2 py-0.5 text-[10px] font-medium text-sage">No downtime</span>
        )}
      </div>

      {/* Downtime Warning */}
      {downtimeWarning && stayDays !== null && stayDays !== undefined && stayDays > 0 && treatment.downtime_days !== null && (
        <p className="mb-3 text-[10px] font-medium text-coral">
          ⚠ Recovery overlaps {Math.round((treatment.downtime_days / stayDays) * 100)}% of your stay
        </p>
      )}

      {/* Tags */}
      {displayTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Clinic Footer */}
      <div className="mt-auto">
        {clinic && (
          <p className="text-[10px] text-muted-foreground">
            {clinic.booking_url ? (
              <a
                href={clinic.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-foreground after:absolute after:inset-0 after:content-['']"
              >
                {localized(clinic.name, locale)}
              </a>
            ) : (
              localized(clinic.name, locale)
            )}
          </p>
        )}
      </div>
    </article>
  );
}

/** Skeleton placeholder for loading state */
export function TreatmentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="mb-3 h-5 w-28" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
