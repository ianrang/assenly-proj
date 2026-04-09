"use client";

import "client-only";

import { useState } from "react";
import { cn } from "@/shared/utils/cn";
import { getAccessToken } from "@/client/core/auth-fetch";

// ============================================================
// OnboardingChips — 채팅 내 인라인 온보딩
// onboarding-and-kit-cta-design.md §2.1
//
// skin_type (단일 선택, 필수) + skin_concerns (다중 선택 1-2개, 선택)
// "Start chatting" → POST /api/profile/onboarding → unmount
// "Skip" → 프로필 미생성 → SuggestedQuestions로 전환
// ============================================================

const SKIN_TYPES = ["dry", "oily", "combination", "sensitive", "normal"] as const;
type SkinType = typeof SKIN_TYPES[number];

const CONCERNS = ["dryness", "acne", "wrinkles", "redness", "dark_spots"] as const;
type Concern = typeof CONCERNS[number];

const MAX_CONCERNS = 2;

const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  dry: "Dry",
  oily: "Oily",
  combination: "Combination",
  sensitive: "Sensitive",
  normal: "Normal",
};

const CONCERN_LABELS: Record<Concern, string> = {
  dryness: "Dryness",
  acne: "Acne",
  wrinkles: "Wrinkles",
  redness: "Redness",
  dark_spots: "Dark spots",
};

type OnboardingChipsProps = {
  onComplete: () => void;
  onSkip: () => void;
};

export default function OnboardingChips({ onComplete, onSkip }: OnboardingChipsProps) {
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleConcern(concern: Concern) {
    setConcerns((prev) => {
      if (prev.includes(concern)) {
        return prev.filter((c) => c !== concern);
      }
      if (prev.length >= MAX_CONCERNS) return prev;
      return [...prev, concern];
    });
  }

  async function handleStart() {
    if (!skinType || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const token = await getAccessToken();
      const res = await fetch("/api/profile/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          skin_type: skinType,
          skin_concerns: concerns,
        }),
      });

      if (res.ok) {
        onComplete();
      } else {
        // 실패해도 채팅은 시작 가능 (Q-15 격리)
        console.error("[OnboardingChips] save failed", res.status);
        onComplete();
      }
    } catch (error) {
      console.error("[OnboardingChips] network error", error);
      onComplete();
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          Before we start, tell me a bit about your skin.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          or skip and just chat
        </p>
      </div>

      {/* Skin Type — 단일 선택 */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Your skin type:</p>
        <div className="flex flex-wrap gap-2">
          {SKIN_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSkinType(type)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                skinType === type
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/50"
              )}
            >
              {SKIN_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Concerns — 다중 선택 1-2개 */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Top concern (choose 1-2):
        </p>
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((concern) => {
            const isSelected = concerns.includes(concern);
            const isDisabled = !isSelected && concerns.length >= MAX_CONCERNS;
            return (
              <button
                key={concern}
                type="button"
                onClick={() => toggleConcern(concern)}
                disabled={isDisabled}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground",
                  isDisabled
                    ? "cursor-not-allowed opacity-40"
                    : "hover:border-primary/50"
                )}
              >
                {CONCERN_LABELS[concern]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={!skinType || isSubmitting}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            skinType
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground"
          )}
        >
          {isSubmitting ? "Saving..." : "Start chatting →"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip &mdash; I&apos;ll just chat
        </button>
      </div>
    </div>
  );
}
