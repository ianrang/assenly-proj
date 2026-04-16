import { setRequestLocale } from "next-intl/server";
import ProfileClient from "@/client/features/profile/ProfileClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ProfileClient locale={locale} />;
}
