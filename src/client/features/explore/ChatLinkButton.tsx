"use client";

import "client-only";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/client/ui/primitives/button";

type ChatLinkButtonProps = {
  locale: string;
};

export default function ChatLinkButton({ locale }: ChatLinkButtonProps) {
  const t = useTranslations("chat");
  return (
    <Link
      href={`/${locale}/chat`}
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      aria-label={t("navLabel")}
      title={t("navLabel")}
    >
      <MessageCircle className="size-5" />
    </Link>
  );
}
