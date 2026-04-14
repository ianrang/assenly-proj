import { setRequestLocale } from "next-intl/server";
import OnboardingWizard from "@/client/features/onboarding/OnboardingWizard";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OnboardingWizard locale={locale} />;
}
