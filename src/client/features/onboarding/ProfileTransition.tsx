"use client";

import "client-only";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SectionTitle, BodyText } from "@/client/ui/primitives/typography";

const STEP_DELAY_MS = 600;
const STEPS = ["transitionStep1", "transitionStep2", "transitionStep3"] as const;

type ProfileTransitionProps = {
  onComplete: () => void;
};

export default function ProfileTransition({ onComplete }: ProfileTransitionProps) {
  const t = useTranslations("onboarding");
  const [completedSteps, setCompletedSteps] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (completedSteps >= STEPS.length) {
      const timer = setTimeout(() => {
        try { onCompleteRef.current(); } catch { /* 라우팅 에러는 Next.js가 처리 */ }
      }, STEP_DELAY_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCompletedSteps((s) => s + 1), STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completedSteps]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-5 text-center">
      <SectionTitle className="mb-2">{t("transitionTitle")}</SectionTitle>
      <BodyText className="mb-8 text-sm">{t("transitionSub")}</BodyText>
      <div className="flex flex-col gap-3">
        {STEPS.map((stepKey, i) => (
          <div
            key={stepKey}
            className="flex items-center gap-2 text-sm"
            aria-live="polite"
          >
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
              i < completedSteps
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {i < completedSteps ? "✓" : "·"}
            </span>
            <span className={i < completedSteps ? "text-foreground" : "text-muted-foreground"}>
              {t(stepKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
