"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { AGE_RANGES, BUDGET_LEVELS, ONBOARDING_TRAVEL_STYLES, ONBOARDING_COUNTRIES } from "@/shared/constants/beauty";
import type { OnboardingFormData } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";
import OptionGroup from "@/client/ui/primitives/option-group";

const STAY_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

const SELECT_CLASS =
  "h-10 w-full appearance-none rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function StepTravel() {
  const t = useTranslations("onboarding");
  const { watch, setValue, register } = useFormContext<OnboardingFormData>();

  const travelStyle = watch("travel_style");

  const travelOptions = ONBOARDING_TRAVEL_STYLES.map((v) => ({
    value: v,
    label: t(`travelStyle_${v}`),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <CardTitle className="mb-2">{t("country")}</CardTitle>
        <select {...register("country")} className={SELECT_CLASS}>
          <option value="" disabled>—</option>
          {ONBOARDING_COUNTRIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <CardTitle>{t("age")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <select {...register("age_range")} className={SELECT_CLASS} defaultValue="">
          <option value="">—</option>
          {AGE_RANGES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <CardTitle className="mb-2">{t("stayDays")}</CardTitle>
        <select
          {...register("stay_days", { valueAsNumber: true })}
          className={SELECT_CLASS}
        >
          <option value={0} disabled>—</option>
          {STAY_DAYS.map((d) => (
            <option key={d} value={d}>{t("stayDaysSuffix", { days: d })}</option>
          ))}
        </select>
      </div>

      <div>
        <CardTitle className="mb-2">{t("budget")}</CardTitle>
        <select {...register("budget_level")} className={SELECT_CLASS} defaultValue="">
          <option value="" disabled>—</option>
          {BUDGET_LEVELS.map((b) => (
            <option key={b} value={b}>{t(`budget_${b}`)}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <CardTitle>{t("travelStyle")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <OptionGroup
          options={travelOptions}
          value={travelStyle}
          onChange={(v) => setValue("travel_style", v as OnboardingFormData["travel_style"], { shouldValidate: true })}
          mode="multiple"
        />
      </div>
    </div>
  );
}
