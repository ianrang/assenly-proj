"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { SectionLabel, SectionTitle, CardTitle, CardDescription } from "@/client/ui/primitives/typography";

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
        <SectionLabel>{t("benefitsLabel")}</SectionLabel>
        <SectionTitle>{t("benefitsTitle")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {BENEFITS.map(({ icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="rounded-lg border border-border bg-card p-4 text-center lg:p-6"
            >
              <span className="mb-2 block text-2xl" aria-hidden="true">
                {icon}
              </span>
              <CardTitle className="text-center">{t(titleKey)}</CardTitle>
              <CardDescription className="text-center">{t(descKey)}</CardDescription>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
