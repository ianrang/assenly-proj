"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations("error");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error("Route error:", error);
    headingRef.current?.focus();
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div role="alert" className="max-w-sm">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mb-3 text-2xl font-bold text-foreground outline-none"
        >
          {t("title")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="min-h-11 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {t("retry")}
          </button>
          <a
            href="/"
            className="min-h-11 rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("home")}
          </a>
        </div>
      </div>
    </div>
  );
}
