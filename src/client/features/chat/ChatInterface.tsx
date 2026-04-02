"use client";

import "client-only";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { mapUIMessageToParts, type UIPartLike } from "./card-mapper";
import MessageList from "./MessageList";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import SuggestedQuestions from "./SuggestedQuestions";

type ChatInterfaceProps = {
  locale: string;
};

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const t = useTranslations("chat");
  const [showSuggestions, setShowSuggestions] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", credentials: "include" }),
    []
  );

  const { messages, status, error, sendMessage } = useChat({ transport });

  const isStreaming = status === "streaming" || status === "submitted";

  // 메시지가 전송되면 제안 질문 숨김
  useEffect(() => {
    if (messages.length > 0) setShowSuggestions(false);
  }, [messages.length]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  // UIMessage.parts → ChatMessagePart[] 변환
  const chatMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: mapUIMessageToParts(m.parts as UIPartLike[]),
  }));

  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              <MessageBubble role="assistant">
                {t("greeting")}
              </MessageBubble>
              {showSuggestions && (
                <SuggestedQuestions onSelect={handleSend} />
              )}
            </div>
          </div>
        ) : (
          <MessageList messages={chatMessages} isStreaming={isStreaming} locale={locale} />
        )}

        {error && (
          <div className="px-4 py-2">
            <p className="text-center text-xs text-destructive">
              {t("errorRetry")}
            </p>
          </div>
        )}

        <InputBar onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
