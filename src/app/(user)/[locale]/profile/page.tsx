import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

// TODO: Implement Profile View/Edit — TDD §3.3
// Display and edit 15 personalization variables + DV-4 AI beauty profile
export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div>Profile — TODO</div>;
}
