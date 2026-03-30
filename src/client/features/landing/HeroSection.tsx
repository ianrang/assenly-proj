"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageTitle, BodyText } from "@/client/ui/primitives/typography";

type HeroSectionProps = {
  ctaEnabled: boolean;
  locale: string;
};

export default function HeroSection({ ctaEnabled, locale }: HeroSectionProps) {
  const t = useTranslations("landing");
  const router = useRouter();

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-light via-surface-warm to-background bg-[length:200%_200%] motion-safe:animate-[gradient-shift_10s_ease_infinite]"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-[960px] px-5 py-14 text-center lg:py-20">
        <PageTitle className="mb-3">
          {t("title")}
        </PageTitle>
        <BodyText className="mx-auto mb-7 max-w-[420px] lg:max-w-[500px]">
          {t("subtitle")}
        </BodyText>
        <div className="mx-auto flex max-w-[360px] flex-col gap-3 lg:max-w-[480px] lg:flex-row">
          <button
            onClick={() => router.push(`/${locale}/onboarding`)}
            disabled={!ctaEnabled}
            className="flex min-h-12 w-full flex-col items-center justify-center rounded-lg bg-primary px-5 py-3 text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:flex-1"
          >
            <span className="text-base font-semibold">{t("pathA")}</span>
            <span className="mt-0.5 text-xs opacity-75">{t("pathADescription")}</span>
          </button>
          <button
            onClick={() => router.push(`/${locale}/chat`)}
            disabled={!ctaEnabled}
            className="flex min-h-12 w-full flex-col items-center justify-center rounded-lg border border-border bg-card px-5 py-3 text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:flex-1"
          >
            <span className="text-base font-semibold">{t("pathB")}</span>
            <span className="mt-0.5 text-xs opacity-75">{t("pathBDescription")}</span>
          </button>
        </div>
        {!ctaEnabled && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("ctaDisabledHint")}
          </p>
        )}
      </div>
    </div>
  );
}
