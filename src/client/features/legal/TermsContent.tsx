"use client";

import "client-only";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/client/ui/primitives/typography";
import {
  PRIVACY_CONTACT_EMAIL,
  DELETION_PROCESSING_DAYS,
  LEGAL_LAST_UPDATED,
} from "@/shared/constants";
import { Section, Subsection } from "./LegalSection";

type TermsContentProps = {
  locale: string;
};

export default function TermsContent({ locale }: TermsContentProps) {
  const t = useTranslations("terms");

  return (
    <article className="py-8">
      <header className="mb-8">
        <PageTitle className="mb-2">{t("title")}</PageTitle>
        <p className="text-sm text-foreground/50">
          {t("lastUpdated", { date: LEGAL_LAST_UPDATED })}
        </p>
      </header>

      <div className="space-y-8 text-[15px] leading-relaxed text-foreground/80">
        <Section title={t("introTitle")}>
          <p>{t("introBody")}</p>
        </Section>

        <Section title={t("serviceTitle")}>
          <p>{t("serviceBody")}</p>
        </Section>

        <Section title={t("useTitle")}>
          <p>{t("useBody")}</p>
        </Section>

        <Section title={t("disclaimerTitle")}>
          <p className="mb-4 font-medium text-foreground">
            {t("disclaimerIntro")}
          </p>

          <Subsection title={t("disclaimerMedical")}>
            <p>{t("disclaimerMedicalBody")}</p>
          </Subsection>

          <Subsection title={t("disclaimerAccuracy")}>
            <p>{t("disclaimerAccuracyBody")}</p>
          </Subsection>

          <Subsection title={t("disclaimerLiability")}>
            <p>{t("disclaimerLiabilityBody")}</p>
          </Subsection>

          <Subsection title={t("disclaimerThirdParty")}>
            <p>{t("disclaimerThirdPartyBody")}</p>
          </Subsection>
        </Section>

        <Section title={t("dataTitle")}>
          <p className="mb-3">{t("dataBody")}</p>
          <Link
            href={`/${locale}/privacy`}
            className="font-medium text-primary underline transition-colors hover:text-primary/80"
          >
            {t("dataLink")}
          </Link>
        </Section>

        <Section title={t("contactTitle")}>
          <p>
            {t("contactBody", {
              email: PRIVACY_CONTACT_EMAIL,
              days: DELETION_PROCESSING_DAYS,
            })}
          </p>
        </Section>

        <Section title={t("changesTitle")}>
          <p>{t("changesBody")}</p>
        </Section>

        <Section title={t("governingTitle")}>
          <p>{t("governingBody")}</p>
        </Section>
      </div>

      <footer className="mt-10 border-t border-border pt-6">
        <Link
          href={`/${locale}`}
          className="text-sm text-foreground/50 transition-colors hover:text-foreground"
        >
          {t("backToHome")}
        </Link>
      </footer>
    </article>
  );
}
