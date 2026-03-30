"use client";

import "client-only";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ModalTitle } from "@/client/ui/primitives/typography";

type ReturnVisitBannerProps = {
  locale: string;
};

export default function ReturnVisitBanner({ locale }: ReturnVisitBannerProps) {
  const t = useTranslations("landing");

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-5 w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <ModalTitle className="mb-2">{t("returnTitle")}</ModalTitle>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("returnDescription")}
        </p>
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/${locale}/profile`}
            className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {t("returnProfile")}
          </Link>
          <Link
            href={`/${locale}/chat`}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("returnChat")}
          </Link>
        </div>
      </div>
    </div>
  );
}
