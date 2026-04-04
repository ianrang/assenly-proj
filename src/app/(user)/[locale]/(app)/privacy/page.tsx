import { setRequestLocale } from "next-intl/server";
import PrivacyContent from "@/client/features/legal/PrivacyContent";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PrivacyContent locale={locale} />;
}
