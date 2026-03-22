import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

// TODO: Implement Onboarding — TDD §3.3
// 4-step profile collection: SkinHair → Concerns → Travel → Interests
export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div>Onboarding — TODO</div>;
}
