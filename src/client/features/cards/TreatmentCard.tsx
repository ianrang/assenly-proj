"use client";

import "client-only";

import type { Treatment, LocalizedText } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import HighlightBadge from "./HighlightBadge";

type TreatmentCardProps = {
  treatment: Treatment;
  clinic?: { name: LocalizedText; booking_url?: string | null } | null;
  whyRecommended?: string;
  stayDays?: number | null;
  locale: string;
};

function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "";
  if (min !== null && max !== null) return `₩${min.toLocaleString()}~${max.toLocaleString()}`;
  if (min !== null) return `₩${min.toLocaleString()}~`;
  return `~₩${max!.toLocaleString()}`;
}

export default function TreatmentCard({ treatment, clinic, whyRecommended, stayDays, locale }: TreatmentCardProps) {
  const isHighlighted = treatment.is_highlighted && treatment.highlight_badge !== null;
  const downtimeWarning = stayDays !== null && stayDays !== undefined && treatment.downtime_days !== null && treatment.downtime_days > 0
    ? treatment.downtime_days >= stayDays * 0.5
    : false;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card p-4 transition-colors",
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
          <p className="text-sm font-semibold text-foreground">
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
      {(treatment.price_min !== null || treatment.price_max !== null) && (
        <p className="mb-2 text-base font-bold text-primary">
          {formatPriceRange(treatment.price_min, treatment.price_max)}
        </p>
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
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              downtimeWarning
                ? "border-coral text-coral"
                : "border-border text-muted-foreground"
            )}
          >
            {treatment.downtime_days}-day recovery
          </span>
        )}
        {treatment.downtime_days === 0 && (
          <span className="text-[10px]">No downtime</span>
        )}
      </div>

      {/* Downtime Warning */}
      {downtimeWarning && stayDays !== null && stayDays !== undefined && stayDays > 0 && treatment.downtime_days !== null && (
        <p className="mb-3 text-[10px] font-medium text-coral">
          ⚠ Recovery overlaps {Math.round((treatment.downtime_days / stayDays) * 100)}% of your stay
        </p>
      )}

      {/* Tags */}
      {treatment.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {treatment.tags.slice(0, 3).map((tag) => (
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
      {clinic && (
        <p className="text-[10px] text-muted-foreground">
          {clinic.booking_url ? (
            <a
              href={clinic.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              {localized(clinic.name, locale)}
            </a>
          ) : (
            localized(clinic.name, locale)
          )}
        </p>
      )}
    </article>
  );
}

/** Skeleton placeholder for loading state */
export function TreatmentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="mb-3 h-5 w-20" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
