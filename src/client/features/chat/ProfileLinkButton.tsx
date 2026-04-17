"use client";

import "client-only";

import Link from "next/link";
import { UserCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/client/ui/primitives/button";

// ============================================================
// NEW-17d: 채팅 Header Profile 진입 버튼.
// onboarding_completed_at 조건부 노출(호출 측에서 제어).
// NEW-33 NewChatButton 패턴 재사용 (icon-size ghost button).
// L-0b: client-only guard. L-17: features 계층이라 비즈니스 용어 허용.
// ============================================================

type ProfileLinkButtonProps = {
  locale: string;
};

export default function ProfileLinkButton({ locale }: ProfileLinkButtonProps) {
  const t = useTranslations("profile");
  return (
    <Link
      href={`/${locale}/profile`}
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      aria-label={t("navLabel")}
      title={t("navLabel")}
    >
      <UserCircle className="size-5" />
    </Link>
  );
}
