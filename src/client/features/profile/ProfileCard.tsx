"use client";

import "client-only";

import { useTranslations } from "next-intl";
import type { UserProfile, Journey } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";

type ProfileCardProps = {
  profile: UserProfile;
  journey: Journey | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  const t = useTranslations("profile");
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || t("notSet")}</span>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <span className="text-sm font-medium text-foreground">
      {items.join(", ")}
    </span>
  );
}

export default function ProfileCard({ profile, journey }: ProfileCardProps) {
  const t = useTranslations("profile");
  const to = useTranslations("onboarding");

  const skinTypeLabels = (profile.skin_types ?? []).map((t) => to(`skinType_${t}`));
  const hairTypeLabel = profile.hair_type ? to(`hairType_${profile.hair_type}`) : null;
  const budgetLabel = journey?.budget_level ? to(`budget_${journey.budget_level}`) : null;

  const skinConcernLabels = (journey?.skin_concerns ?? []).map((c) => to(`skinConcern_${c}`));
  const hairConcernLabels = (profile.hair_concerns ?? []).map((c) => to(`hairConcern_${c}`));
  const travelLabels = (journey?.travel_style ?? []).map((s) => to(`travelStyle_${s}`));
  const interestLabels = (journey?.interest_activities ?? []).map((a) => to(`interest_${a}`));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <CardTitle className="mb-4 text-lg">{t("title")}</CardTitle>

      <div className="flex items-baseline justify-between border-b border-border py-2.5">
        <span className="text-sm text-muted-foreground">{t("skinType")}</span>
        {skinTypeLabels.length ? (
          <span className="text-sm font-medium text-foreground">{skinTypeLabels.join(", ")}</span>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{t("notSet")}</span>
        )}
      </div>
      <Row label={t("hairType")} value={hairTypeLabel} />

      {skinConcernLabels.length > 0 && (
        <div className="flex items-baseline justify-between border-b border-border py-2.5">
          <span className="text-sm text-muted-foreground">{t("skinConcerns")}</span>
          <TagList items={skinConcernLabels} />
        </div>
      )}

      {hairConcernLabels.length > 0 && (
        <div className="flex items-baseline justify-between border-b border-border py-2.5">
          <span className="text-sm text-muted-foreground">{t("hairConcerns")}</span>
          <TagList items={hairConcernLabels} />
        </div>
      )}

      <Row label={t("country")} value={profile.country} />
      {profile.age_range && <Row label={t("age")} value={profile.age_range} />}

      {journey && (
        <>
          {journey.stay_days && (
            <Row label={t("stayDays")} value={t("daysInKorea", { days: journey.stay_days })} />
          )}
          <Row label={t("budget")} value={budgetLabel} />

          {travelLabels.length > 0 && (
            <div className="flex items-baseline justify-between border-b border-border py-2.5">
              <span className="text-sm text-muted-foreground">{t("travelStyle")}</span>
              <TagList items={travelLabels} />
            </div>
          )}

          {interestLabels.length > 0 && (
            <div className="flex items-baseline justify-between border-b border-border py-2.5 last:border-0">
              <span className="text-sm text-muted-foreground">{t("interests")}</span>
              <TagList items={interestLabels} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
