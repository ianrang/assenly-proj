import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

// TODO: Implement Landing page — TDD §3, PRD §2.1
// Two entry paths: Path A (onboarding) / Path B (direct chat)
export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div>Landing — TODO</div>;
}
