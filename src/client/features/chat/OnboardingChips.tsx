"use client";

import "client-only";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  SKIN_TYPES,
  ONBOARDING_SKIN_CONCERNS,
  MAX_ONBOARDING_SKIN_CONCERNS,
} from "@/shared/constants/beauty";
import type { SkinType, SkinConcern } from "@/shared/types/domain";
import { getAccessToken } from "@/client/core/auth-fetch";
import OptionGroup from "@/client/ui/primitives/option-group";
import { Button } from "@/client/ui/primitives/button";

// ============================================================
// OnboardingChips — 채팅 내 인라인 온보딩 (NEW-9b v2)
//
// 정본: PRD §4-A §578/§595 (skin_type 5종 + skin_concerns 7종 표시 / 최대 3개)
//       docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md §2.1
//
// 설계:
// - 기존 자산 재사용 (G-2 중복 금지):
//   - SKIN_TYPES / ONBOARDING_SKIN_CONCERNS / MAX_ONBOARDING_SKIN_CONCERNS (shared/constants)
//   - OptionGroup primitive (client/ui/primitives)
//   - onboarding.* i18n 키 (skinType_*, skinConcern_*)
//   - chat.onboarding.* i18n 키 (greeting, skipHint, start, saving, skip, error)
// - 2 경로: Start(skin_type 필수, concerns 선택) / Skip (API로 완료 기록)
// - 실패 시 에러 표시 + 재시도 (자동 onComplete 금지)
// - 부모(ChatContent)가 onboarding_completed_at 기반으로 재표시 판정
// ============================================================

type OnboardingChipsProps = {
  /** 서버 저장 성공 시 호출. 부모는 showOnboarding=false 로 전환. */
  onComplete: () => void;
};

/** Start 경로 페이로드 */
type StartPayload = {
  skipped?: false;
  skin_type: SkinType;
  skin_concerns: SkinConcern[];
};

/** Skip 경로 페이로드 */
type SkipPayload = {
  skipped: true;
};

type OnboardingPayload = StartPayload | SkipPayload;

async function submitOnboarding(payload: OnboardingPayload): Promise<boolean> {
  const token = await getAccessToken();
  const res = await fetch("/api/profile/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export default function OnboardingChips({ onComplete }: OnboardingChipsProps) {
  const tChat = useTranslations("chat");
  const tOnb = useTranslations("onboarding");

  const [skinType, setSkinType] = useState<SkinType | "">("");
  const [concerns, setConcerns] = useState<SkinConcern[]>([]);
  const [submitMode, setSubmitMode] = useState<"idle" | "start" | "skip">("idle");
  const [hasError, setHasError] = useState(false);

  const isSubmitting = submitMode !== "idle";

  // OptionGroup은 string|string[] 인터페이스 → SkinType/SkinConcern 변환
  const skinOptions = SKIN_TYPES.map((v) => ({
    value: v,
    label: tOnb(`skinType_${v}`),
  }));
  const concernOptions = ONBOARDING_SKIN_CONCERNS.map((v) => ({
    value: v,
    label: tOnb(`skinConcern_${v}`),
  }));

  async function handleStart() {
    if (!skinType || isSubmitting) return;
    setSubmitMode("start");
    setHasError(false);
    try {
      const ok = await submitOnboarding({
        skin_type: skinType,
        skin_concerns: concerns,
      });
      if (ok) {
        onComplete();
      } else {
        setHasError(true);
        setSubmitMode("idle");
      }
    } catch (error) {
      console.error("[OnboardingChips] start failed", error);
      setHasError(true);
      setSubmitMode("idle");
    }
  }

  async function handleSkip() {
    if (isSubmitting) return;
    setSubmitMode("skip");
    setHasError(false);
    try {
      const ok = await submitOnboarding({ skipped: true });
      if (ok) {
        onComplete();
      } else {
        setHasError(true);
        setSubmitMode("idle");
      }
    } catch (error) {
      console.error("[OnboardingChips] skip failed", error);
      setHasError(true);
      setSubmitMode("idle");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {tChat("onboarding.greeting")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tChat("onboarding.skipHint")}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {tOnb("skinType")}
        </p>
        <OptionGroup
          options={skinOptions}
          value={skinType}
          onChange={(v) => setSkinType(v as SkinType | "")}
          mode="single"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {tOnb("skinConcerns")}{" "}
          <span className="text-muted-foreground/70">
            ({concerns.length}/{MAX_ONBOARDING_SKIN_CONCERNS})
          </span>
        </p>
        <OptionGroup
          options={concernOptions}
          value={concerns}
          onChange={(v) => setConcerns(v as SkinConcern[])}
          mode="multiple"
          max={MAX_ONBOARDING_SKIN_CONCERNS}
        />
      </div>

      {hasError && (
        <p className="text-xs text-destructive" role="alert">
          {tChat("onboarding.error")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="cta"
          onClick={handleStart}
          disabled={!skinType || isSubmitting}
        >
          {submitMode === "start" ? tChat("onboarding.saving") : tChat("onboarding.start")}
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitMode === "skip" ? tChat("onboarding.saving") : tChat("onboarding.skip")}
        </button>
      </div>
    </div>
  );
}
