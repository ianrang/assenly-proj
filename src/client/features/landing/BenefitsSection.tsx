"use client";

import "client-only";

import { useTranslations } from "next-intl";

const BENEFITS = [
  { icon: "🧴", titleKey: "benefitProductsTitle", descKey: "benefitProductsDesc" },
  { icon: "🏥", titleKey: "benefitClinicsTitle", descKey: "benefitClinicsDesc" },
  { icon: "🗺️", titleKey: "benefitMapTitle", descKey: "benefitMapDesc" },
  { icon: "🎁", titleKey: "benefitKitTitle", descKey: "benefitKitDesc" },
] as const;

export default function BenefitsSection() {
  const t = useTranslations("landing");

  return (
    <section className="border-t border-border py-12 lg:py-16">
      <div className="mx-auto max-w-[960px] px-5">
        <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-primary">
          {t("benefitsLabel")}
        </p>
        <h2 className="mb-8 text-center text-xl font-bold lg:text-[26px]">
          {t("benefitsTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {BENEFITS.map(({ icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="rounded-lg border border-border bg-card p-4 text-center lg:p-6"
            >
              <span className="mb-2 block text-2xl" aria-hidden="true">
                {icon}
              </span>
              <p className="text-base font-semibold">{t(titleKey)}</p>
              <p className="text-sm leading-snug text-muted-foreground">
                {t(descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
