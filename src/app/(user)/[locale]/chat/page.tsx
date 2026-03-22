import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

// TODO: Implement Chat + Results — TDD §3.2, §4.2
// Streaming AI chat with product/treatment cards
export default async function ChatPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div>Chat — TODO</div>;
}
