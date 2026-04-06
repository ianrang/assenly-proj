"use client";

import "client-only";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { getAccessToken } from "@/client/core/auth-fetch";
import { mapUIMessageToParts, type UIPartLike } from "./card-mapper";
import MessageList from "./MessageList";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import SuggestedQuestions from "./SuggestedQuestions";

// ============================================================
// ChatContent — P2-50c: 채팅 UI (히스토리 + 메시지 + 입력)
// ChatInterface에서 phase="ready" 시 렌더.
// L-0b: client-only guard. L-10: 서버 상태 = API 호출.
// ============================================================

type ChatContentProps = {
  locale: string;
  initialMessages: UIMessage[];
  initialConversationId: string | null;
};

export default function ChatContent({ locale, initialMessages, initialConversationId }: ChatContentProps) {
  const t = useTranslations("chat");
  const [showSuggestions, setShowSuggestions] = useState(
    initialMessages.length === 0
  );
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId
  );

  // P2-79: credentials → headers(Bearer 동적 주입)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const token = await getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages[messages.length - 1],
            conversation_id: conversationId,
          },
        }),
      }),
    [conversationId]
  );

  // AI SDK 6.x: messages prop = 초기 메시지 (최초 마운트 시에만 유효)
  const { messages, status, error, sendMessage } = useChat({
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      // P2-50b: messageMetadata에서 conversationId 추출
      const meta = message.metadata as
        | { conversationId?: string }
        | undefined;
      if (meta?.conversationId && !conversationId) {
        setConversationId(meta.conversationId);
      }
    },
  });

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
