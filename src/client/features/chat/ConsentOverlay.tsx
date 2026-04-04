"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BodyText } from "@/client/ui/primitives/typography";
import { Button } from "@/client/ui/primitives/button";

// ============================================================
// ConsentOverlay — P2-45: Chat 진입 시 동의 수집 UI
// L-0b: client-only guard.
// R-11: shared/ + client/ui/ 만 import.
// 비즈니스 로직 없음 — 순수 UI. onConsent 콜백은 부모에서 주입.
// ============================================================

type ConsentOverlayProps = {
  onConsent: () => Promise<boolean>;
  isConsenting: boolean;
  hasError: boolean;
  locale: string;
};

export default function ConsentOverlay({ onConsent, isConsenting, hasError, locale }: ConsentOverlayProps) {
  const tc = useTranslations("consent");
  const router = useRouter();

  function handleCancel() {
    router.push(`/${locale}`);
  }

  async function handleAccept() {
    await onConsent();
  }

  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col items-center justify-center px-5">
      <div className="mx-auto w-full max-w-[360px] lg:max-w-[480px]">
        <BodyText className="mb-4 text-center leading-relaxed text-foreground/70">
          {tc("consentNotice")}{" "}
          <a
            href={`/${locale}/terms`}
            className="underline transition-colors hover:text-primary"
          >
            {tc("learnMore")}
          </a>
        </BodyText>
        {hasError && (
          <p className="mb-3 text-center text-xs text-destructive">
            {tc("error")}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="cta"
            onClick={handleCancel}
            className="flex-1"
          >
            {tc("cancel")}
          </Button>
          <Button
            size="cta"
            onClick={handleAccept}
            disabled={isConsenting}
            className="flex-1"
          >
            {tc("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
