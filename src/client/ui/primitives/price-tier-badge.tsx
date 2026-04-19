"use client";

import "client-only";

import type { TierLevel } from "@/shared/utils/compute-tier";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/client/ui/primitives/popover";
import { cn } from "@/shared/utils/cn";

const TIER_LABELS: Record<TierLevel, string> = {
  $: "Budget",
  $$: "Mid-range",
  $$$: "Premium",
};

type PriceTierBadgeProps = {
  tier: TierLevel | null;
  domain: string;
  thresholdLabel: string;
  showInfo?: boolean;
  className?: string;
};

export default function PriceTierBadge({
  tier,
  domain,
  thresholdLabel,
  showInfo = true,
  className,
}: PriceTierBadgeProps) {
  if (tier === null) return null;

  const tierLabel = TIER_LABELS[tier];
  const ariaLabel = `${tierLabel} price for ${domain}s, typically ${thresholdLabel}.`;

  return (
    <div
      className={cn("flex items-center", className)}
      aria-label={ariaLabel}
      role="group"
    >
      <span className="font-bold text-primary">
        {tier}
      </span>
      {showInfo && (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={200}
            aria-label={`${domain} price info`}
            className="relative z-10 ml-0.5 inline-flex items-center justify-center rounded-full p-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 active:bg-muted"
          >
            ⓘ
          </PopoverTrigger>
          <PopoverContent>
            <p>
              {tier}: {tierLabel}, typically {thresholdLabel} for {domain}s
            </p>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
