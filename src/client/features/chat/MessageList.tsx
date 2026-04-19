"use client";

import "client-only";

import { useEffect, useRef, useState } from "react";
import type { ChatMessagePart } from "./card-mapper";
import { groupParts, cardKey } from "./group-parts";
import MessageBubble from "./MessageBubble";
import MessageGroup from "./MessageGroup";
import StreamingIndicator from "./StreamingIndicator";
import ProductCard from "@/client/features/cards/ProductCard";
import TreatmentCard from "@/client/features/cards/TreatmentCard";
import StoreCard from "@/client/features/cards/StoreCard";
import ClinicCard from "@/client/features/cards/ClinicCard";
import KitCtaSheet from "./KitCtaSheet";
import MarkdownMessage from "./MarkdownMessage";

// v1.2 NEW-10: KitCtaCard 삭제, Kit CTA는 ProductCard(compact) 내부 is_highlighted 분기로 통합.
// StandalonePart도 제거 (kit-cta-card 전용이었음). KitCtaSheet는 그대로 유지.

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatMessagePart[];
};

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  locale: string;
  conversationId: string | null;
};

export default function MessageList({ messages, isStreaming, locale, conversationId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const lastPartsLength = messages[messages.length - 1]?.parts.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, lastPartsLength]);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        <div className="flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <MessageGroup key={msg.id || `msg-${idx}`} role={msg.role}>
              <GroupedParts parts={msg.parts} role={msg.role} locale={locale} onKitClaim={() => setSheetOpen(true)} />
            </MessageGroup>
          ))}
          {isStreaming && <StreamingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>
      <KitCtaSheet open={sheetOpen} onOpenChange={setSheetOpen} conversationId={conversationId} locale={locale} />
    </>
  );
}

/** 가로 스크롤 내 개별 카드. compact variant. v1.2: onKitClaim 콜백 전달. */
function CardPart({
  part,
  locale,
  onKitClaim,
}: {
  part: ChatMessagePart;
  locale: string;
  onKitClaim: () => void;
}) {
  switch (part.type) {
    case 'product-card':
      return (
        <ProductCard
          product={part.product}
          brand={part.brand}
          store={part.store}
          whyRecommended={part.whyRecommended}
          locale={locale}
          variant="compact"
          onKitClaim={onKitClaim}
        />
      );
    case 'treatment-card':
      return (
        <TreatmentCard
          treatment={part.treatment}
          clinic={part.clinic}
          whyRecommended={part.whyRecommended}
          stayDays={null}
          locale={locale}
          variant="compact"
        />
      );
    case 'store-card':
      return (
        <StoreCard
          store={part.store}
          whyRecommended={part.whyRecommended}
          locale={locale}
          variant="compact"
        />
      );
    case 'clinic-card':
      return (
        <ClinicCard
          clinic={part.clinic}
          whyRecommended={part.whyRecommended}
          locale={locale}
          variant="compact"
        />
      );
    default:
      return null;
  }
}

/** 연속 카드 파트를 가로 스크롤 그룹으로 묶어 렌더. v1.2: standalone 제거, 모든 카드 가로 스크롤. */
function GroupedParts({
  parts,
  role,
  locale,
  onKitClaim,
}: {
  parts: ChatMessagePart[];
  role: "user" | "assistant";
  locale: string;
  onKitClaim: () => void;
}) {
  const groups = groupParts(parts);

  return (
    <>
      {groups.map((group, gi) => {
        if (group.type === 'text') {
          return (
            <MessageBubble key={gi} role={role}>
              {role === 'assistant' ? <MarkdownMessage text={group.part.text} /> : group.part.text}
            </MessageBubble>
          );
        }
        // cards (product/treatment)
        return (
          <div key={gi} className="flex max-w-full gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin">
            {group.cards.map((card) => (
              <CardPart key={cardKey(card)} part={card} locale={locale} onKitClaim={onKitClaim} />
            ))}
          </div>
        );
      })}
    </>
  );
}
