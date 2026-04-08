"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/client/ui/primitives/button";

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
        <p className="mb-2 text-5xl font-bold text-primary">!</p>
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
          <Button onClick={reset} size="cta" className="w-full">
            {t("retry")}
          </Button>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "cta", className: "w-full" })}
          >
            {t("home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
