"use client";

import "client-only";

import { useEffect, useRef, useState } from "react";
import type { ChatMessagePart } from "./card-mapper";
import MessageBubble from "./MessageBubble";
import MessageGroup from "./MessageGroup";
import StreamingIndicator from "./StreamingIndicator";
import ProductCard from "@/client/features/cards/ProductCard";
import TreatmentCard from "@/client/features/cards/TreatmentCard";
import KitCtaCard from "./KitCtaCard";
import KitCtaSheet from "./KitCtaSheet";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatMessagePart[];
};

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  locale: string;
};

export default function MessageList({ messages, isStreaming, locale }: MessageListProps) {
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
          {messages.map((msg) => (
            <MessageGroup key={msg.id} role={msg.role}>
              <GroupedParts parts={msg.parts} role={msg.role} locale={locale} onKitClaim={() => setSheetOpen(true)} />
            </MessageGroup>
          ))}
          {isStreaming && <StreamingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>
      <KitCtaSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

const SCROLL_CARD_TYPES = ['product-card', 'treatment-card'] as const;

function isScrollCard(part: ChatMessagePart): boolean {
  return (SCROLL_CARD_TYPES as readonly string[]).includes(part.type);
}

type PartGroup =
  | { type: 'text'; part: { type: 'text'; text: string } }
  | { type: 'cards'; cards: ChatMessagePart[] }
  | { type: 'standalone'; part: ChatMessagePart };

/** parts 배열에서 연속 product/treatment 카드를 그룹화. kit-cta는 standalone. */
function groupParts(parts: ChatMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let cardBuffer: ChatMessagePart[] = [];

  function flushCards() {
    if (cardBuffer.length > 0) {
      groups.push({ type: 'cards', cards: [...cardBuffer] });
      cardBuffer = [];
    }
  }

  for (const part of parts) {
    if (part.type === 'text') {
      flushCards();
      groups.push({ type: 'text', part });
    } else if (isScrollCard(part)) {
      cardBuffer.push(part);
    } else {
      flushCards();
      groups.push({ type: 'standalone', part });
    }
  }
  flushCards();

  return groups;
}

/** 가로 스크롤 내 개별 카드. compact variant. */
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
    default:
      return null;
  }
}

/** 전체 폭 standalone 카드 (kit-cta-card 등). */
function StandalonePart({
  part,
  locale,
  onKitClaim,
}: {
  part: ChatMessagePart;
  locale: string;
  onKitClaim: () => void;
}) {
  if (part.type === 'kit-cta-card') {
    return (
      <KitCtaCard
        productName={part.productName}
        highlightBadge={part.highlightBadge}
        locale={locale}
        onClaim={onKitClaim}
      />
    );
  }
  return null;
}

/** 연속 카드 파트를 가로 스크롤 그룹으로 묶어 렌더 */
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
          return <MessageBubble key={gi} role={role}>{group.part.text}</MessageBubble>;
        }
        if (group.type === 'cards') {
          return (
            <div key={gi} className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin">
              {group.cards.map((card, ci) => (
                <CardPart key={ci} part={card} locale={locale} onKitClaim={onKitClaim} />
              ))}
            </div>
          );
        }
        // standalone (kit-cta-card)
        return (
          <div key={gi} className="w-full max-w-[85%]">
            <StandalonePart part={group.part} locale={locale} onKitClaim={onKitClaim} />
          </div>
        );
      })}
    </>
  );
}
