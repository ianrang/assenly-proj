"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageTitle, BodyText } from "@/client/ui/primitives/typography";
import { Button } from "@/client/ui/primitives/button";

// ============================================================
// HeroSection — P2-45: 동의 UI 제거, CTA → /chat 직접 이동
// 동의는 ChatInterface에서 수집 (P2-45 ConsentOverlay).
// ============================================================

type HeroSectionProps = {
  state: "loading" | "new" | "returning";
  locale: string;
};

export default function HeroSection({ state, locale }: HeroSectionProps) {
  const t = useTranslations("landing");
  const router = useRouter();

  function handleCtaClick() {
    router.push(`/${locale}/chat`);
  }

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

        <div className="mx-auto max-w-[360px] lg:max-w-[480px]">
          <Button
            size="cta"
            onClick={handleCtaClick}
            disabled={state === "loading"}
            className="w-full"
          >
            {state === "returning" ? t("returnCta") : t("pathA")}
          </Button>
          <p className="mt-2.5 text-center text-xs text-foreground/50">
            {t("ctaDescription")}
          </p>
          <Button
            variant="outline"
            size="cta"
            onClick={() => router.push(`/${locale}/explore`)}
            className="mt-3 w-full"
          >
            {t("browseExplore")}
          </Button>
        </div>
      </div>
    </div>
  );
}
