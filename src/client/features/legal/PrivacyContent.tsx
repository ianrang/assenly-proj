"use client";

import "client-only";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/client/ui/primitives/typography";
import {
  PRIVACY_CONTACT_EMAIL,
  DATA_RETENTION_DAYS,
  DELETION_PROCESSING_DAYS,
  LEGAL_LAST_UPDATED,
} from "@/shared/constants";
import { Section } from "./LegalSection";

type PrivacyContentProps = {
  locale: string;
};

export default function PrivacyContent({ locale }: PrivacyContentProps) {
  const t = useTranslations("privacy");

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

        <Section title={t("collectionTitle")}>
          <p className="mb-3">{t("collectionIntro")}</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t("collectionProfile")}</li>
            <li>{t("collectionTravel")}</li>
            <li>{t("collectionChat")}</li>
            <li>{t("collectionEmail")}</li>
          </ul>
          <p className="mt-3 font-medium text-foreground">
            {t("collectionNot")}
          </p>
        </Section>

        <Section title={t("consentTitle")}>
          <p className="mb-3">{t("consentIntro")}</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t("consentRetention")}</li>
            <li>{t("consentMarketing")}</li>
          </ul>
        </Section>

        <Section title={t("useTitle")}>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t("useRecommendations")}</li>
            <li>{t("useContext")}</li>
            <li>{t("useKit")}</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground">
            {t("useNoSelling")}
          </p>
        </Section>

        <Section title={t("retentionTitle")}>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {t("retentionAnonymous", { days: DATA_RETENTION_DAYS })}
            </li>
            <li>{t("retentionSession")}</li>
            <li>{t("retentionDerived")}</li>
          </ul>
        </Section>

        <Section title={t("deletionTitle")}>
          <p className="mb-3">{t("deletionIntro")}</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {t("deletionAuto", { days: DATA_RETENTION_DAYS })}
            </li>
            <li>
              {t("deletionEmail", {
                email: PRIVACY_CONTACT_EMAIL,
                processingDays: DELETION_PROCESSING_DAYS,
              })}
            </li>
          </ul>
          <p className="mt-3 text-sm text-foreground/60">
            {t("deletionAnonymousNote")}
          </p>
          <p className="mt-2">{t("deletionScope")}</p>
        </Section>

        <Section title={t("securityTitle")}>
          <p>{t("securityBody")}</p>
        </Section>

        <Section title={t("contactTitle")}>
          <p>
            {t("contactBody", {
              email: PRIVACY_CONTACT_EMAIL,
              processingDays: DELETION_PROCESSING_DAYS,
            })}
          </p>
        </Section>

        <Section title={t("changesTitle")}>
          <p>{t("changesBody")}</p>
        </Section>

        <div>
          <Link
            href={`/${locale}/terms`}
            className="font-medium text-primary underline transition-colors hover:text-primary/80"
          >
            {t("termsLink")}
          </Link>
        </div>
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
