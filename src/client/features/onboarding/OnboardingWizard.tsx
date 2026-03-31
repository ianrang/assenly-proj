"use client";

import "client-only";

import { useState, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { OnboardingFormData } from "@/shared/types/profile";
import { SectionTitle, BodyText, CardTitle } from "@/client/ui/primitives/typography";
import { Button } from "@/client/ui/primitives/button";
import ProgressBar from "./ProgressBar";
import StepSkinHair from "./StepSkinHair";
import StepConcerns from "./StepConcerns";
import StepTravel from "./StepTravel";
import StepInterests from "./StepInterests";

const TOTAL_STEPS = 4;
const STORAGE_KEY = "onboarding_draft";

const DEFAULT_VALUES: OnboardingFormData = {
  skin_type: "" as OnboardingFormData["skin_type"],
  hair_type: null,
  hair_concerns: [],
  skin_concerns: [],
  country: "",
  age_range: undefined,
  stay_days: 0,
  budget_level: "" as OnboardingFormData["budget_level"],
  travel_style: [],
  interest_activities: [],
};

type OnboardingWizardProps = {
  locale: string;
};

export default function OnboardingWizard({ locale }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const methods = useForm<OnboardingFormData>({ defaultValues: DEFAULT_VALUES });
  const { watch, reset, getValues } = methods;

  // localStorage 복원 (마운트 시 1회)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { step: number; data: OnboardingFormData };
        reset(parsed.data);
        setStep(parsed.step);
      }
    } catch {
      // 파싱 실패 시 무시
    }
  }, [reset]);

  // 단계 전환 시 localStorage 백업
  useEffect(() => {
    const values = getValues();
    // 초기 빈 상태는 저장하지 않음
    if (!values.skin_type && step === 1) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data: values }));
    } catch {
      // 저장 실패 시 무시
    }
  }, [step, getValues]);

  const watchedValues = watch();

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return !!watchedValues.skin_type;
      case 2:
        return watchedValues.skin_concerns.length >= 1;
      case 3:
        return !!watchedValues.country && watchedValues.stay_days > 0 && !!watchedValues.budget_level;
      case 4:
        return true;
      default:
        return false;
    }
  }

  function handleNext() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  async function handleSubmit() {
    const values = getValues();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/profile/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          age_range: values.age_range || undefined,
          stay_days: Number(values.stay_days),
        }),
        credentials: "include",
      });
      if (res.ok) {
        localStorage.removeItem(STORAGE_KEY);
        router.push(`/${locale}/profile`);
      } else {
        setSubmitError(t("submitError"));
        console.error("Onboarding submit failed:", res.status);
      }
    } catch (err) {
      setSubmitError(t("submitError"));
      console.error("Onboarding submit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepTitles = [t("step1Title"), t("step2Title"), t("step3Title"), t("step4Title")];

  return (
    <FormProvider {...methods}>
      <div className="px-5 py-6">
        <SectionTitle className="mb-1 text-left">{t("heading")}</SectionTitle>
        <BodyText className="mb-4 text-sm">{t("headingSub")}</BodyText>

        <ProgressBar current={step} total={TOTAL_STEPS} />

        <CardTitle className="mb-5 text-lg">{stepTitles[step - 1]}</CardTitle>

        {step === 1 && <StepSkinHair />}
        {step === 2 && <StepConcerns />}
        {step === 3 && <StepTravel />}
        {step === 4 && <StepInterests />}

        {submitError && (
          <p className="mt-4 text-center text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}

        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              size="cta"
              onClick={handleBack}
              className="flex-1"
            >
              {t("back")}
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              size="cta"
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1"
            >
              {t("next")}
            </Button>
          ) : (
            <Button
              type="button"
              size="cta"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? t("submitting") : t("generateProfile")}
            </Button>
          )}
        </div>
      </div>
    </FormProvider>
  );
}
