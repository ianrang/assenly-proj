"use client";

import "client-only";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/client/ui/primitives/button";

type ProfileBannerProps = {
  locale: string;
};

export default function ProfileBanner({ locale }: ProfileBannerProps) {
  const t = useTranslations("explore");
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative flex items-center gap-3 rounded-lg bg-primary/5 px-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium">{t("profileBanner.title")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("profileBanner.description")}</p>
      </div>
      <Button
        size="sm"
        onClick={() => router.push(`/${locale}/profile/edit`)}
      >
        {t("profileBanner.cta")}
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
