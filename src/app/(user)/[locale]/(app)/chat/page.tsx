import { setRequestLocale } from "next-intl/server";
import ChatInterface from "@/client/features/chat/ChatInterface";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ChatPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ChatInterface locale={locale} />;
}
