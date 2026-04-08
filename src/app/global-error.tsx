"use client";

import "./globals.css";

// ============================================================
// global-error — 루트 레이아웃 에러 바운더리 (최후 방어선)
// 루트 layout.tsx 자체가 에러 시 렌더. html/body 직접 제공 필수.
// globals.css import 필수 — 루트 layout.tsx가 실패했으므로 CSS 재로드.
// NextIntlClientProvider 밖이므로 useTranslations 불가 → 영어 하드코딩.
// ============================================================

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: Props) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
          <div className="max-w-sm">
            <h1 className="mb-3 text-2xl font-bold">
              Something went wrong
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              An unexpected error occurred. Please try again.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 루트 에러 바운더리: Next.js 라우터 컨텍스트 없음, 풀 리로드 필요 */}
              <a
                href="/"
                className="rounded-full border border-border px-6 py-3 text-sm font-medium"
              >
                Back to home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
