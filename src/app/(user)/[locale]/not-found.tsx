import Link from "next/link";
import { getTranslations } from "next-intl/server";

// 서버 컴포넌트 — buttonVariants(client-only cva) 호출 불가.
// app/not-found.tsx와 동일하게 인라인 Tailwind 클래스 사용.
export default async function NotFoundPage() {
  const t = await getTranslations("error");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <p className="mb-2 text-5xl font-bold text-primary">404</p>
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          {t("notFoundTitle")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("notFoundDescription")}
        </p>
        <Link
          href="/"
          className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
