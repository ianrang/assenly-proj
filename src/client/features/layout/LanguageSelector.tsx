"use client";

import "client-only";

import { usePathname, useRouter } from "next/navigation";
import { Dropdown, type DropdownOption } from "@/client/ui/primitives/dropdown";
import { routing } from "@/i18n/routing";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  zh: "中文",
  es: "Español",
  fr: "Français",
};

// routing.locales 기반으로 MVP 지원 언어만 표시
const LANGUAGE_OPTIONS: DropdownOption[] = routing.locales.map((code) => ({
  value: code,
  label: `${code.toUpperCase()} ${LANGUAGE_LABELS[code] ?? code}`,
}));

export default function LanguageSelector() {
  const pathname = usePathname();
  const router = useRouter();

  // URL에서 현재 locale 추출: /en/chat → "en"
  const currentLocale = routing.locales.find((loc) =>
    pathname.startsWith(`/${loc}/`) || pathname === `/${loc}`,
  ) ?? routing.defaultLocale;

  function handleChange(newLocale: string) {
    if (newLocale === currentLocale) return;

    // /en/chat → /ko/chat, /en → /ko
    const newPathname = pathname.replace(
      new RegExp(`^/${currentLocale}(/|$)`),
      `/${newLocale}$1`,
    );
    router.replace(newPathname);
  }

  return (
    <Dropdown
      value={currentLocale}
      onChange={handleChange}
      options={LANGUAGE_OPTIONS}
      ariaLabel="Site language"
    />
  );
}
