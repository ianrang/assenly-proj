import { getTranslations } from "next-intl/server";

export default async function NotFoundPage() {
  const t = await getTranslations("error");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          {t("notFoundTitle")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("notFoundDescription")}
        </p>
        <a
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {t("home")}
        </a>
      </div>
    </div>
  );
}
