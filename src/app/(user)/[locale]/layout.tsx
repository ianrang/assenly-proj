import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://essenly-proj.vercel.app"),
  title: {
    template: "%s | Essenly",
    default: "Essenly — Your AI K-Beauty Guide",
  },
  description:
    "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans.",
  openGraph: {
    type: "website",
    siteName: "Essenly",
    title: "Essenly — Your AI K-Beauty Guide",
    description:
      "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Essenly" }],
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: "Essenly — Your AI K-Beauty Guide",
    description:
      "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans.",
    images: ["/og.png"],
  },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <NextIntlClientProvider>
      {children}
    </NextIntlClientProvider>
  );
}
