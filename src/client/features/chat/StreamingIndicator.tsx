"use client";

import "client-only";

import { useTranslations } from "next-intl";

export default function StreamingIndicator() {
  const t = useTranslations("chat");

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-[10px] rounded-bl-sm border border-border-warm bg-surface-warm px-3.5 py-2.5 text-sm text-muted-foreground">
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
        </span>
        {t("streaming")}
      </div>
    </div>
  );
}
