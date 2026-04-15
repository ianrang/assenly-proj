"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { HAIR_CONCERNS, MAX_ONBOARDING_SKIN_CONCERNS, ONBOARDING_SKIN_CONCERNS } from "@/shared/constants/beauty";
import type { OnboardingFormData } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";
import OptionGroup from "@/client/ui/primitives/option-group";

export default function StepConcerns() {
  const t = useTranslations("onboarding");
  const { watch, setValue } = useFormContext<OnboardingFormData>();

  const skinConcerns = watch("skin_concerns");
  const hairConcerns = watch("hair_concerns");

  const skinOptions = ONBOARDING_SKIN_CONCERNS.map((v) => ({
    value: v,
    label: t(`skinConcern_${v}`),
  }));
  const hairOptions = HAIR_CONCERNS.map((v) => ({
    value: v,
    label: t(`hairConcern_${v}`),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <CardTitle className="mb-1">{t("skinConcerns")}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("skinConcernsCount", { count: skinConcerns.length })}
        </p>
        <OptionGroup
          options={skinOptions}
          value={skinConcerns}
          onChange={(v) => setValue("skin_concerns", v as OnboardingFormData["skin_concerns"], { shouldValidate: true })}
          mode="multiple"
          max={MAX_ONBOARDING_SKIN_CONCERNS}
        />
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <CardTitle>{t("hairConcerns")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <OptionGroup
          options={hairOptions}
          value={hairConcerns}
          onChange={(v) => setValue("hair_concerns", v as OnboardingFormData["hair_concerns"], { shouldValidate: true })}
          mode="multiple"
        />
      </div>
    </div>
  );
}
