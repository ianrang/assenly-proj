"use client";

import "client-only";

import type { TierLevel } from "@/shared/utils/compute-tier";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/client/ui/primitives/tooltip";
import { cn } from "@/shared/utils/cn";

const TIER_LABELS: Record<TierLevel, string> = {
  $: "Budget",
  $$: "Mid-range",
  $$$: "Premium",
};

type PriceTierBadgeProps = {
  tier: TierLevel | null;
  displayPrice: string | null;
  domain: string;
  thresholdLabel: string;
  showInfo?: boolean;
  className?: string;
};

export default function PriceTierBadge({
  tier,
  displayPrice,
  domain,
  thresholdLabel,
  showInfo = true,
  className,
}: PriceTierBadgeProps) {
  if (tier === null) return null;

  const tierLabel = TIER_LABELS[tier];
  const ariaLabel = displayPrice
    ? `${tierLabel} price for ${domain}s, typically ${thresholdLabel}. Approximately ${displayPrice.replace("~", "")}.`
    : `${tierLabel} price for ${domain}s, typically ${thresholdLabel}. Price varies.`;

  return (
    <div
      className={cn("flex items-center", className)}
      aria-label={ariaLabel}
      role="group"
    >
      <span className="font-bold text-primary">
        {tier} · {displayPrice ?? ""}
      </span>
      {displayPrice === null && (
        <span className="font-normal text-muted-foreground">Price varies</span>
      )}
      {showInfo && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              aria-label={`${domain} price info`}
              className="ml-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[11px] text-muted-foreground"
            >
              ⓘ
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {tier}: {tierLabel}, typically {thresholdLabel} for {domain}s
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
