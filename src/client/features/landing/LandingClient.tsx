"use client";

import "client-only";

import { useEffect, useState } from "react";
import { authFetch } from "@/client/core/auth-fetch";
import LandingHeader from "@/client/features/landing/LandingHeader";
import HeroSection from "@/client/features/landing/HeroSection";
import HowItWorksSection from "@/client/features/landing/HowItWorksSection";
import BenefitsSection from "@/client/features/landing/BenefitsSection";
import TrustSection from "@/client/features/landing/TrustSection";

// ============================================================
// LandingClient — P2-45: 동의 로직 제거 (Chat으로 이동)
// 상태: loading | new | returning (consented 제거)
// ============================================================

type LandingClientProps = {
  locale: string;
};

type LandingState = "loading" | "new" | "returning";

export default function LandingClient({ locale }: LandingClientProps) {
  const [state, setState] = useState<LandingState>("loading");

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await authFetch("/api/profile");
        if (res.ok) {
          setState("returning");
        } else {
          setState("new");
        }
      } catch {
        setState("new");
      }
    }
    checkSession();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection state={state} locale={locale} />
        <HowItWorksSection />
        <BenefitsSection />
        <TrustSection />
      </main>
    </div>
  );
}
