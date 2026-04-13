"use client";

import "client-only";

import { cn } from "@/shared/utils/cn";

type MessageGroupProps = {
  role: "user" | "assistant";
  children: React.ReactNode;
};

/** 동일 메시지의 파트들을 시각적으로 묶는 래퍼 (user-screens §6.1) */
export default function MessageGroup({ role, children }: MessageGroupProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2",
        role === "user" ? "items-end" : "items-start"
      )}
    >
      {children}
    </div>
  );
}
