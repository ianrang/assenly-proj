"use client";

import "client-only";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import StreamingIndicator from "./StreamingIndicator";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
};

export default function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastContent = messages[messages.length - 1]?.content ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, lastContent]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role}>
            {msg.content}
          </MessageBubble>
        ))}
        {isStreaming && <StreamingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
