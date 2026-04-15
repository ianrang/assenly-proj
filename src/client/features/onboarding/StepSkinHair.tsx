"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { SKIN_TYPES, HAIR_TYPES } from "@/shared/constants/beauty";
import type { OnboardingFormData } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";
import OptionGroup from "@/client/ui/primitives/option-group";

export default function StepSkinHair() {
  const t = useTranslations("onboarding");
  const { watch, setValue } = useFormContext<OnboardingFormData>();

  const skinType = watch("skin_type");
  const hairType = watch("hair_type");

  const skinOptions = SKIN_TYPES.map((v) => ({ value: v, label: t(`skinType_${v}`) }));
  const hairOptions = HAIR_TYPES.map((v) => ({ value: v, label: t(`hairType_${v}`) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <CardTitle className="mb-3">{t("skinType")}</CardTitle>
        <OptionGroup
          options={skinOptions}
          value={skinType ?? ""}
          onChange={(v) => setValue("skin_type", v as OnboardingFormData["skin_type"], { shouldValidate: true })}
          mode="single"
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline gap-2">
          <CardTitle>{t("hairType")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <OptionGroup
          options={hairOptions}
          value={hairType ?? ""}
          onChange={(v) => setValue("hair_type", (v || null) as OnboardingFormData["hair_type"], { shouldValidate: true })}
          mode="single"
        />
      </div>
    </div>
  );
}
