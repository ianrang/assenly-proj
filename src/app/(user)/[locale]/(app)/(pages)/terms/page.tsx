import { setRequestLocale } from "next-intl/server";
import TermsContent from "@/client/features/legal/TermsContent";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <TermsContent locale={locale} />;
}
