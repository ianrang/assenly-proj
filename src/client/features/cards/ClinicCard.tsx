"use client";

import "client-only";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { Clinic } from "@/shared/types/domain";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import { cn } from "@/shared/utils/cn";
import { localized } from "@/shared/utils/localized";
import { INTERNAL_TAG_PREFIXES } from "@/shared/constants";
import HighlightBadge from "./HighlightBadge";
import { extractMapUrl } from "./map-utils";

type ClinicCardProps = {
  clinic: Clinic;
  whyRecommended?: string;
  locale: string;
  variant?: "default" | "compact";
};

export default function ClinicCard({ clinic, whyRecommended, locale, variant = "default" }: ClinicCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = clinic.images[0];
  const showImage = imgSrc && !imgError;
  const isHighlighted = clinic.is_highlighted && clinic.highlight_badge !== null;
  const isCompact = variant === "compact";
  const displayTags = clinic.tags
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
          {clinic.clinic_type && (
            <span className="truncate rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {clinic.clinic_type}
            </span>
          )}
          {isHighlighted && (
            <HighlightBadge isHighlighted={clinic.is_highlighted} badge={clinic.highlight_badge} locale={locale} />
          )}
        </div>
        <p className="truncate text-xs font-semibold text-foreground">{localized(clinic.name, locale)}</p>
        {clinic.district && (
          <p className="truncate text-[10px] text-muted-foreground">{clinic.district}</p>
        )}
        {clinic.english_support && clinic.english_support !== "none" && (
          <span className="mt-1 inline-block w-fit rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            EN: {clinic.english_support}
          </span>
        )}
        {clinic.rating !== null && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{"★"} {clinic.rating.toFixed(1)}</p>
        )}
        {clinic.booking_url && (
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

  const mapUrl = extractMapUrl(clinic.external_links);
  const ff = clinic.foreigner_friendly;
  const primaryUrl = clinic.booking_url ?? mapUrl;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        isHighlighted ? "border-primary" : "border-border hover:border-primary/50"
      )}
    >
      <div className="relative flex h-40 items-center justify-center bg-surface-warm">
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element -- 외부 URL 이미지, next/image 도메인 설정 별도 작업 */
          <img
            src={imgSrc}
            alt={localized(clinic.name, locale)}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <Stethoscope className="size-10 text-muted-foreground/30" />
        )}
        {isHighlighted && (
          <div className="absolute left-2 top-2">
            <HighlightBadge isHighlighted={clinic.is_highlighted} badge={clinic.highlight_badge} locale={locale} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {clinic.clinic_type && (
          <span className="mb-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {clinic.clinic_type}
          </span>
        )}
        <p className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">{localized(clinic.name, locale)}</p>
        {clinic.district && <p className="mb-1 text-xs text-muted-foreground">{clinic.district}</p>}
        {whyRecommended && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{whyRecommended}</p>}

        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {clinic.english_support && clinic.english_support !== "none" && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">EN: {clinic.english_support}</span>
          )}
          {clinic.rating !== null && <span>{"★"} {clinic.rating.toFixed(1)}</span>}
          {clinic.license_verified && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">Verified</span>
          )}
        </div>

        {ff && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ff.interpreter_available && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Interpreter</span>}
            {ff.english_consent_form && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">EN Consent Form</span>}
            {ff.international_cards && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Int&apos;l Cards</span>}
            {ff.pickup_service && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Pickup</span>}
          </div>
        )}

        {displayTags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {displayTags.map((tag) => (
              <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          {primaryUrl && (
            <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground underline transition-colors hover:text-foreground after:absolute after:inset-0 after:content-['']">{clinic.booking_url ? "Book Appointment" : "Map"}</a>
          )}
          {clinic.booking_url && mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="relative z-10 text-[10px] text-muted-foreground underline transition-colors hover:text-foreground">Map</a>
          )}
        </div>
      </div>
    </article>
  );
}

export function ClinicCardSkeleton() {
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
