"use client";

import "client-only";

import { useState, useMemo, useRef, useEffect } from "react";
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
import OnboardingChips from "./OnboardingChips";

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
  // v1.2 NEW-9: 온보딩 칩 표시 여부. 신규 세션(메시지+대화 없음)에서만 표시.
  // 온보딩 완료 또는 스킵 시 false → SuggestedQuestions 또는 빈 채팅으로 전환.
  const [showOnboarding, setShowOnboarding] = useState(
    initialMessages.length === 0 && initialConversationId === null
  );
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId
  );
  // ref로 최신 conversationId를 transport 클로저에서 참조 (클로저 캡처 타이밍 문제 방지).
  //
  // 멀티 탭 동시성 주의사항 (adversarial review, 2026년 4월):
  // - AI SDK useChat은 단일 스트림 제약: 이전 요청 완료 전 새 sendMessage는 큐잉되므로
  //   **단일 탭 환경**에서는 race 조건이 발생하지 않는다.
  // - 멀티 탭 환경(같은 사용자가 두 탭에서 동시 접속)에서는 각 탭의 useChat이 독립적이므로
  //   탭 #1이 첫 응답을 받기 전 탭 #2가 메시지를 보내면 탭 #2는 `conversationId=null`로
  //   전송되어 새 conversation이 생성되고 대화 분리가 발생할 수 있다.
  // - 현재 MVP는 anonymous 세션만 지원하고 멀티 탭은 비정상 경로로 간주. 실사용 시 대화 분리는
  //   v0.2 계정 인증 + 서버사이드 lastActiveConversationId 병합으로 정면 해결 예정.
  // - 회귀 방지: conversationIdRef + useEffect 동기화는 단일 탭 순차 전송 시나리오에서
  //   충분히 안전하다 (messages #1 완료 → onFinish → setConversationId → useEffect flush → #2 전송).
  const conversationIdRef = useRef<string | null>(initialConversationId);
  const retryCountRef = useRef(0);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  const localeRef = useRef(locale);

  // P2-79: credentials → headers(Bearer 동적 주입)
  // transport는 1회만 생성. conversationId는 ref로 최신 값 참조.
  /* eslint-disable react-hooks/refs -- ref는 memo 초기화 시가 아닌 prepareSendMessagesRequest 호출 시(이벤트) 읽힘 */
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
            conversation_id: conversationIdRef.current,
            locale: localeRef.current,
          },
        }),
      }),
    []
  );
  /* eslint-enable react-hooks/refs */

  // AI SDK 6.x: messages prop = 초기 메시지 (최초 마운트 시에만 유효)
  const { messages, status, error, sendMessage, regenerate, clearError } = useChat({
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      // P2-50b: messageMetadata에서 conversationId 추출 (기존)
      const meta = message.metadata as
        | { conversationId?: string }
        | undefined;
      if (meta?.conversationId && !conversationIdRef.current) {
        setConversationId(meta.conversationId);
      }

      // 빈 응답 감지 + 자동 1회 재시도
      const hasText = message.parts?.some(
        (p: { type: string; text?: string }) =>
          p.type === 'text' && typeof p.text === 'string' && p.text.trim() !== ''
      );
      if (!hasText && retryCountRef.current < 1) {
        retryCountRef.current += 1;
        regenerate();
        return;
      }
      retryCountRef.current = 0;
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // 초기 메시지가 있으면(히스토리 복원) 제안 질문 숨김
  const showSuggestionsResolved = showSuggestions && messages.length === 0;

  function handleSend(text: string) {
    setShowSuggestions(false);
    retryCountRef.current = 0;
    sendMessage({ text });
  }

  // UIMessage.parts → ChatMessagePart[] 변환
  const chatMessages = messages
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: mapUIMessageToParts(m.parts as UIPartLike[]),
    }))
    .filter((m) => m.parts.length > 0);

  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              {showOnboarding ? (
                /* v1.2 NEW-9: 인라인 온보딩 칩 UI */
                <OnboardingChips
                  onComplete={() => {
                    setShowOnboarding(false);
                    setShowSuggestions(false);
                  }}
                  onSkip={() => {
                    setShowOnboarding(false);
                    // Skip 시 AI 인사 메시지 + SuggestedQuestions 표시
                  }}
                />
              ) : (
                <>
                  <MessageBubble role="assistant">
                    {t("greeting")}
                  </MessageBubble>
                  {showSuggestionsResolved && (
                    <SuggestedQuestions onSelect={handleSend} />
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <MessageList messages={chatMessages} isStreaming={isStreaming} locale={locale} conversationId={conversationId} />
        )}

        {error && (
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => {
                clearError();
                regenerate();
              }}
              className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              {t("errorRetry")}
            </button>
          </div>
        )}

        <InputBar onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
