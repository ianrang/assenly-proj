"use client";

import "client-only";

import { cn } from "@/shared/utils/cn";

type MessageBubbleProps = {
  role: "user" | "assistant";
  children: React.ReactNode;
};

export default function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "w-fit max-w-[80%] rounded-md px-3.5 py-2.5 text-sm leading-normal",
          isUser
            ? "rounded-br-[4px] bg-primary text-primary-foreground"
            : "rounded-bl-[4px] border border-border-warm bg-surface-warm text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}
