import Link from "next/link";

// ============================================================
// Root not-found — 루트 레벨 404 (locale 라우트 밖)
// 서버 컴포넌트 — "use client" 모듈(buttonVariants 등) 함수 호출 불가.
// NextIntlClientProvider 밖이므로 useTranslations 불가 → 영어 하드코딩.
// [locale]/not-found.tsx는 locale 내부 404 처리.
// ============================================================

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <p className="mb-2 text-5xl font-bold text-primary">404</p>
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          Page not found
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
