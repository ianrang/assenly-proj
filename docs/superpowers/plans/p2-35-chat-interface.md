# P2-35: Chat 인터페이스

## 목표

AI 스트리밍 채팅 + 추천 카드 렌더링. useChat(AI SDK) 기반 SSE 소비.

## 정본

- PRD §3.4 (Results 와이어프레임), §3.5 (경로B 특별 처리)
- user-screens.md §6 (컴포넌트 트리, 메시지 타입, 스트리밍, 상태 매트릭스)
- design-preview.html (버블 스타일, 입력바)
- api-spec.md §3.1-3.3 (SSE 형식, 에러 코드)

## 범위

| 포함 | 제외 |
|------|------|
| ChatInterface (오케스트레이션) | Kit CTA Card + Sheet (P2-40) |
| MessageBubble (user/ai) | Markdown 렌더링 (v0.2) |
| MessageList (스크롤, 탭 필터) | 프로필 저장 제안 (서버 연동 필요) |
| InputBar (Enter 전송, visualViewport) | |
| SuggestedQuestions (경로B) | |
| StreamingIndicator | |
| useChat AI SDK 연동 | |

## 패키지 설치

```
npm install @ai-sdk/react --save-exact
```

## 파일 계획

| 파일 | 작업 | 설명 |
|------|------|------|
| `features/chat/ChatInterface.tsx` | 스텁 → 구현 | useChat 통합, 탭/프로필 상태 관리 |
| `features/chat/MessageList.tsx` | **신규** | 메시지 목록, auto-scroll, 탭 필터 |
| `features/chat/MessageBubble.tsx` | 스텁 → 구현 | user/ai 버블 스타일 |
| `features/chat/InputBar.tsx` | 스텁 → 구현 | textarea + 전송, visualViewport |
| `features/chat/SuggestedQuestions.tsx` | **신규** | 경로B 3개 제안 버블 |
| `features/chat/StreamingIndicator.tsx` | **신규** | "AI is responding..." |
| `app/(user)/[locale]/(app)/chat/page.tsx` | 스텁 → ChatInterface 렌더링 |
| `messages/en.json` | 번역 키 추가 |

## 의존성 방향

```
app/chat/page.tsx → features/chat/ChatInterface
  → features/chat/MessageList → features/chat/MessageBubble
  → features/chat/InputBar
  → features/chat/SuggestedQuestions
  → features/chat/StreamingIndicator
  → features/layout/TabBar
  → features/cards/ProductCard, TreatmentCard
  → ui/primitives/button, typography, skeleton
  → shared/types, shared/utils/localized
```

역방향 없음. core/ 수정 없음. server/ import 없음.

## 디자인 (design-preview.html 정본)

| 요소 | 스타일 |
|------|--------|
| User 버블 | bg-primary, text-primary-foreground, 우측 정렬, max-w-[80%], rounded-[10px] 우하 4px |
| AI 버블 | bg-surface-warm, border border-border-warm, 좌측 정렬, max-w-[80%], rounded-[10px] 좌하 4px |
| 메시지 간격 | gap-3 (12px) |
| InputBar | flex gap-2, textarea(flex-1 bg-card border-border) + Button(Send) |
| 제안 버블 | bg-surface-warm, border-border-warm, 클릭 가능, rounded-lg |

## 프리미티브 재사용

| UI 요소 | 프리미티브 |
|---------|-----------|
| Send 버튼 | `<Button size="sm">` |
| 제안 버블 | `<Button variant="outline" size="sm">` |
| 로딩 | Skeleton |
| 탭 | TabBar (P2-36) |
| 카드 | ProductCard/TreatmentCard (P2-37/38) |
| 타이포 | CardTitle, BodyText |

## useChat 통합 (AI SDK v6)

```tsx
import { useChat } from "@ai-sdk/react";

const { messages, status, error, sendMessage } = useChat({
  api: "/api/chat",
  body: { conversation_id: conversationId },
  credentials: "include",
});

// v6 API: sendMessage({ text }) for sending, status for streaming state
```

- messages: 렌더링 대상
- status: "streaming" | "submitted" → StreamingIndicator 표시 / InputBar 비활성
- error: 에러 UI 표시
- sendMessage({ text }): 메시지 전송

## 검증 체크리스트

- [ ] V-1: DAG 준수
- [ ] V-2: core/ 수정 없음
- [ ] V-4: 타 features 도메인 import 없음 (cards/ 카드만)
- [ ] V-13: 디자인 토큰만
- [ ] L-0b: "use client" + "client-only"
- [ ] L-12: 모바일 퍼스트
- [ ] S-5: Button 프리미티브 사용
- [ ] G-8: any 없음
- [ ] Q-9: exact version (@ai-sdk/react)
