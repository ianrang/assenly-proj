"use client";

import "client-only";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import TabBar from "@/client/features/layout/TabBar";
import MessageList from "./MessageList";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import SuggestedQuestions from "./SuggestedQuestions";

type ChatInterfaceProps = {
  locale: string;
};

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const t = useTranslations("chat");
  const [activeTab, setActiveTab] = useState("shops");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", credentials: "include" }),
    []
  );

  const { messages, status, error, sendMessage } = useChat({ transport });

  const isStreaming = status === "streaming" || status === "submitted";

  // 프로필 존재 여부 확인 (경로A vs 경로B 분기)
  useEffect(() => {
    const controller = new AbortController();
    async function checkProfile() {
      try {
        const res = await fetch("/api/profile", {
          credentials: "include",
          signal: controller.signal,
        });
        setHasProfile(res.ok);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHasProfile(false);
      }
    }
    checkProfile();
    return () => controller.abort();
  }, []);

  // 메시지가 전송되면 제안 질문 숨김
  useEffect(() => {
    if (messages.length > 0) setShowSuggestions(false);
  }, [messages.length]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  // UIMessage.parts → 표시용 텍스트 추출
  const chatMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "",
  }));

  return (
    <div className="flex h-[calc(100dvh-52px)] flex-col">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              <MessageBubble role="assistant">
                {t("greeting")}
              </MessageBubble>
              {showSuggestions && hasProfile === false && (
                <SuggestedQuestions onSelect={handleSend} />
              )}
            </div>
          </div>
        ) : (
          <MessageList messages={chatMessages} isStreaming={isStreaming} />
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
