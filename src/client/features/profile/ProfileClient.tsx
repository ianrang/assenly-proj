"use client";

import "client-only";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserProfile, Journey } from "@/shared/types/profile";
import { Button, buttonVariants } from "@/client/ui/primitives/button";
import { Skeleton } from "@/client/ui/primitives/skeleton";
import ProfileCard from "./ProfileCard";

type ProfileClientProps = {
  locale: string;
};

type ProfileState =
  | { status: "loading" }
  | { status: "loaded"; profile: UserProfile; journey: Journey | null }
  | { status: "error" };

export default function ProfileClient({ locale }: ProfileClientProps) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          setState({
            status: "loaded",
            profile: json.data.profile,
            journey: json.data.active_journey,
          });
        } else if (res.status === 404) {
          router.replace(`/${locale}/onboarding`);
        } else {
          setState({ status: "error" });
        }
      } catch {
        setState({ status: "error" });
      }
    }
    fetchProfile();
  }, [locale, router]);

  if (state.status === "loading") {
    return (
      <div className="px-5 py-6">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-2/3" />
        <Skeleton className="mt-6 h-11 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center px-5 text-center">
        <p className="mb-4 text-sm text-muted-foreground">{t("loading")}</p>
        <Button size="cta" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <ProfileCard profile={state.profile} journey={state.journey} />

      <div className="mt-6 flex gap-3">
        <Link
          href={`/${locale}/onboarding`}
          className={buttonVariants({ variant: "outline", size: "cta", className: "flex-1" })}
        >
          {t("edit")}
        </Link>
        <Link
          href={`/${locale}/chat`}
          className={buttonVariants({ size: "cta", className: "flex-1" })}
        >
          {t("continue")}
        </Link>
      </div>
    </div>
  );
}
