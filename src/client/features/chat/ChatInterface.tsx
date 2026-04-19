"use client";

import "client-only";

import { useState, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import { getSupabaseBrowserClient } from "@/client/core/supabase-browser";
import { authFetch } from "@/client/core/auth-fetch";
import Header from "@/client/features/layout/Header";
import ConsentOverlay from "./ConsentOverlay";
import ChatContent from "./ChatContent";
import NewChatButton from "./NewChatButton";
import ProfileLinkButton from "@/client/features/layout/ProfileLinkButton";

// ============================================================
// ChatInterface — P2-45: 동의 게이트 + P2-50c 히스토리 로드
// P2-79: 클라이언트 SDK signInAnonymously + authFetch Bearer 전달.
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

/** 프로필 조회 응답 (NEW-9b) */
interface ProfileResponse {
  data: {
    profile: { onboarding_completed_at: string | null } | null;
    active_journey: unknown;
  };
}

/**
 * NEW-9b: 프로필 조회 결과를 "온보딩 완료" 단일 불리언으로 축약.
 * Fail-closed 규칙:
 *   - 404 Profile not found → 신규 사용자 → false (칩 표시)
 *   - 200 OK → onboarding_completed_at 유무로 판정
 *   - 401/500/network → true (fail-closed, 칩 미표시)
 *     이미 완료한 사용자에게 중복 표시 방지. 신규 사용자는 다음 세션에 복구.
 */
async function fetchOnboardingCompleted(): Promise<boolean> {
  try {
    const res = await authFetch("/api/profile");
    if (res.status === 404) return false;
    if (!res.ok) return true; // fail-closed
    const json = (await res.json()) as ProfileResponse;
    return json.data?.profile?.onboarding_completed_at != null;
  } catch {
    return true; // fail-closed
  }
}

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [isConsenting, setIsConsenting] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);
  const [initialOnboardingCompleted, setInitialOnboardingCompleted] = useState(false);
  // NEW-33: key 변경으로 ChatContent 리마운트 → useChat 초기화
  const [chatKey, setChatKey] = useState(0);
  // ChatContent에서 메시지 전송 시 true로 전환. 리셋 시 false 복귀.
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const showResetButton = phase === "ready" && hasStartedChat;

  // P2-45: 세션 확인 + 히스토리 로드 + 프로필(NEW-9b) 병렬 조회.
  // 히스토리는 인증 관문 역할, 프로필은 온보딩 완료 판정 전용.
  // 히스토리 성공 후에만 프로필을 조회하여 ready 전환 전 initialOnboardingCompleted를 결정.
  const checkSessionAndLoad = useCallback(() => {
    setPhase("checking");
    void (async () => {
      try {
        const res = await authFetch("/api/chat/history");
        if (res.status === 401 || !res.ok) {
          setPhase("needs-consent");
          return;
        }
        const history = (await res.json()) as HistoryResponse;

        // history 성공 → 프로필 병렬 조회 (fail-closed)
        const completed = await fetchOnboardingCompleted();
        setInitialOnboardingCompleted(completed);

        const msgs = history.data?.messages;
        if (msgs && Array.isArray(msgs) && msgs.length > 0) {
          setInitialMessages(msgs);
          setInitialConversationId(history.data.conversation_id);
          setHasStartedChat(true);
        }
        setPhase("ready");
      } catch {
        setPhase("needs-consent");
      }
    })();
  }, []);

  useEffect(() => {
    checkSessionAndLoad();
  }, [checkSessionAndLoad]);

  // P2-79: 동의 처리 → 클라이언트 SDK 세션 생성 → 서버 동의 기록 → 재시도
  async function handleConsent(): Promise<boolean> {
    setIsConsenting(true);
    setConsentError(false);
    try {
      // 1. 클라이언트 SDK로 익명 세션 생성 (auth-matrix.md §1.3)
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setConsentError(true);
        return false;
      }

      // 2. 서버에 동의 기록 (Bearer 토큰 자동 주입)
      const res = await authFetch("/api/auth/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: { data_retention: true } }),
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

  // NEW-33: 대화 초기화 — 기존 row 조작 없이 클라이언트 상태만 리셋.
  // 다음 메시지 전송 시 getOrCreateConversation이 새 conversation 자동 생성.
  function handleReset() {
    setInitialMessages([]);
    setInitialConversationId(null);
    setHasStartedChat(false);
    setChatKey((k) => k + 1);
  }

  if (phase === "checking") {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-[640px] flex-1 px-5">
          <ChatSkeleton />
        </main>
      </>
    );
  }

  if (phase === "needs-consent") {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-[640px] flex-1 px-5">
          <ConsentOverlay
            onConsent={handleConsent}
            isConsenting={isConsenting}
            hasError={consentError}
            locale={locale}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <Header
        leftContent={
          <NewChatButton onReset={handleReset} hasMessages={showResetButton} />
        }
        rightContent={
          // NEW-17d: onboarding 완료 사용자에게만 /profile 진입 버튼 노출.
          // 미완료 사용자는 클릭 시 /api/profile 404 → /chat 리다이렉트가 되므로 왕복 방지.
          initialOnboardingCompleted ? (
            <ProfileLinkButton locale={locale} />
          ) : null
        }
      />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-5">
        <ChatContent
          key={chatKey}
          locale={locale}
          initialMessages={initialMessages}
          initialConversationId={initialConversationId}
          initialOnboardingCompleted={initialOnboardingCompleted}
          onOnboardingComplete={() => setInitialOnboardingCompleted(true)}
          onMessageSent={() => setHasStartedChat(true)}
        />
      </main>
    </>
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
