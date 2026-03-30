"use client";

import "client-only";

import { useTranslations } from "next-intl";

type ConsentBannerProps = {
  onConsent: () => void;
  isLoading: boolean;
  locale: string;
};

export default function ConsentBanner({ onConsent, isLoading, locale }: ConsentBannerProps) {
  const t = useTranslations("consent");

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-[960px] items-center gap-4 px-5 py-3">
        <p className="flex-1 text-sm leading-snug text-muted-foreground">
          {t("description")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onConsent}
            disabled={isLoading}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {t("accept")}
          </button>
          <a
            href={`/${locale}/terms`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("learnMore")}
          </a>
        </div>
      </div>
    </div>
  );
}
