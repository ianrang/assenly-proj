import Link from "next/link";
import { headers } from "next/headers";
import { routing } from "@/i18n/routing";

// ============================================================
// Root not-found — 루트 레벨 404 (locale 라우트 밖)
// NextIntlClientProvider 밖이므로 useTranslations 불가.
// URL 경로에서 locale을 추출하여 메시지 파일을 직접 로드.
// [locale]/not-found.tsx는 locale 내부 404 처리.
// ============================================================

/** URL pathname에서 locale 추출. 매칭 없으면 defaultLocale. */
function detectLocale(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (segment && routing.locales.includes(segment as (typeof routing.locales)[number])) {
    return segment;
  }
  return routing.defaultLocale;
}

export default async function RootNotFound() {
  const headersList = await headers();
  const pathname = headersList.get("x-next-url") ?? headersList.get("x-invoke-path") ?? "/";
  const locale = detectLocale(pathname);

  // 메시지 파일 직접 로드 (NextIntlClientProvider 밖이므로)
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const t = (key: string) => {
    const keys = key.split(".");
    let value: Record<string, unknown> = messages;
    for (const k of keys) {
      value = value[k] as Record<string, unknown>;
      if (!value) return key;
    }
    return value as unknown as string;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <p className="mb-2 text-5xl font-bold text-primary">404</p>
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          {t("error.notFoundTitle")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("error.notFoundDescription")}
        </p>
        <Link
          href={`/${locale}`}
          className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          {t("error.home")}
        </Link>
      </div>
    </div>
  );
}
