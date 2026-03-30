"use client";

import "client-only";

import { useTranslations } from "next-intl";

const STEPS = [1, 2, 3] as const;

export default function HowItWorksSection() {
  const t = useTranslations("landing");

  return (
    <section className="border-t border-border py-12 lg:py-16">
      <div className="mx-auto max-w-[960px] px-5">
        <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-primary">
          {t("howItWorksLabel")}
        </p>
        <h2 className="mb-8 text-center text-xl font-bold lg:text-[26px]">
          {t("howItWorksTitle")}
        </h2>
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          {STEPS.map((n) => (
            <div
              key={n}
              className="flex gap-3.5 lg:flex-1 lg:flex-col lg:items-center lg:text-center"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-[15px] font-bold text-primary">
                {n}
              </div>
              <div>
                <p className="text-base font-semibold">
                  {t(`step${n}Title` as `step1Title`)}
                </p>
                <p className="text-sm leading-snug text-muted-foreground">
                  {t(`step${n}Desc` as `step1Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
