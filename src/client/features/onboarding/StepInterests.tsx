"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { INTEREST_ACTIVITIES } from "@/shared/constants/beauty";
import type { OnboardingFormData } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";
import OptionGroup from "@/client/ui/primitives/option-group";

export default function StepInterests() {
  const t = useTranslations("onboarding");
  const { watch, setValue } = useFormContext<OnboardingFormData>();

  const interests = watch("interest_activities");

  const interestOptions = INTEREST_ACTIVITIES.map((v) => ({
    value: v,
    label: t(`interest_${v}`),
  }));

  return (
    <div>
      <CardTitle className="mb-3">{t("interests")}</CardTitle>
      <OptionGroup
        options={interestOptions}
        value={interests}
        onChange={(v) => setValue("interest_activities", v as OnboardingFormData["interest_activities"], { shouldValidate: true })}
        mode="multiple"
      />
    </div>
  );
}
