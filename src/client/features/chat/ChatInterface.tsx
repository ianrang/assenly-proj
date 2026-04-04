"use client";

import "client-only";

import { useState, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import ConsentOverlay from "./ConsentOverlay";
import ChatContent from "./ChatContent";

// ============================================================
// ChatInterface — P2-45: 동의 게이트 + P2-50c 히스토리 로드
// L-0b: client-only guard. L-10: 서버 상태 = API 호출.
// 구조: ChatInterface(동의 게이트) → ChatContent(채팅 UI)
//   phase: checking → needs-consent | ready
//   needs-consent → ConsentOverlay → 동의 후 재시도
//   ready → ChatContent(히스토리 로드 + 채팅)
// ============================================================

type ChatInterfaceProps = {
  locale: string;
};

type Phase = "checking" | "needs-consent" | "ready";

/** 히스토리 로드 응답 타입 */
interface HistoryResponse {
  data: {
    messages: UIMessage[];
    conversation_id: string | null;
  };
}

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [isConsenting, setIsConsenting] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  // P2-45: 세션 확인 + 히스토리 로드 (L-10: 서버 상태 = API 호출)
  const checkSessionAndLoad = useCallback(() => {
    setPhase("checking");
    fetch("/api/chat/history", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          setPhase("needs-consent");
          return null;
        }
        if (!res.ok) {
          // 500 등 서버 에러 → 세션 미확인 → 동의 필요로 간주
          setPhase("needs-consent");
          return null;
        }
        return res.json() as Promise<HistoryResponse>;
      })
      .then((json) => {
        if (!json) return;
        if (json.data?.messages && Array.isArray(json.data.messages) && json.data.messages.length > 0) {
          setInitialMessages(json.data.messages);
          setInitialConversationId(json.data.conversation_id);
        }
        setPhase("ready");
      })
      .catch(() => {
        // 네트워크 에러 → 동의 필요로 간주 (서버 연결 실패)
        setPhase("needs-consent");
      });
  }, []);

  useEffect(() => {
    checkSessionAndLoad();
  }, [checkSessionAndLoad]);

  // P2-45: 동의 처리 → 세션 생성 → 재시도
  async function handleConsent(): Promise<boolean> {
    setIsConsenting(true);
    setConsentError(false);
    try {
      const res = await fetch("/api/auth/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: { data_retention: true } }),
        credentials: "include",
      });
      if (res.ok) {
        checkSessionAndLoad();
        return true;
      }
      setConsentError(true);
      return false;
    } catch {
      setConsentError(true);
      return false;
    } finally {
      setIsConsenting(false);
    }
  }

  if (phase === "checking") {
    return <ChatSkeleton />;
  }

  if (phase === "needs-consent") {
    return (
      <ConsentOverlay
        onConsent={handleConsent}
        isConsenting={isConsenting}
        hasError={consentError}
        locale={locale}
      />
    );
  }

  return (
    <ChatContent
      locale={locale}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
    />
  );
}

// ── ChatSkeleton ──────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-3">
            <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-muted" />
            <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
