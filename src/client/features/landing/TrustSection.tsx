"use client";

import "client-only";

import { useTranslations } from "next-intl";

const TRUST_ITEMS = [
  { icon: "🔓", titleKey: "trustNoSignup", descKey: "trustNoSignupDesc" },
  { icon: "🛡️", titleKey: "trustNoShare", descKey: "trustNoShareDesc" },
  { icon: "🗑️", titleKey: "trustDelete", descKey: "trustDeleteDesc" },
] as const;

export default function TrustSection() {
  const t = useTranslations("landing");

  return (
    <section className="border-t border-border py-12 lg:py-16">
      <div className="mx-auto max-w-[960px] px-5">
        <div className="mx-auto max-w-[640px] rounded-xl border border-border bg-card p-6 text-center lg:p-9">
          <h2 className="mb-1 text-lg font-bold">{t("trustTitle")}</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {t("trustSubtitle")}
          </p>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-3">
            {TRUST_ITEMS.map(({ icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="flex items-center gap-2.5 rounded-md bg-surface-warm p-3 text-left lg:flex-1 lg:flex-col lg:items-center lg:p-4 lg:text-center"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm"
                  aria-hidden="true"
                >
                  {icon}
                </div>
                <div className="text-[13px]">
                  <p className="font-semibold">{t(titleKey)}</p>
                  <p className="text-muted-foreground">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>
          <a
            href="https://www.instagram.com/essenly.beauty/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
            {t("followUs")}
          </a>
        </div>
      </div>
    </section>
  );
}
