# P2-19: 채팅 서비스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat 오케스트레이터 (`features/chat/service.ts`). conversation 관리 + 프롬프트 조립 + LLM 스트리밍 호출 + 3개 tool 등록. 비동기 후처리(히스토리 저장, 추출 결과 저장)는 route handler(P2-23) 책임.

**Architecture:** R-5에 따라 자기 도메인(chat/) 내부 + core/ + shared/ 만 import. 3개 tool handler를 AI SDK tool 형태로 등록. profile/journey는 route에서 파라미터 수신 (L-3, P-4). `callWithFallback`으로 LLM 호출 + 스트리밍 반환.

**Tech Stack:** TypeScript, Vercel AI SDK 6.x (`streamText`, `zodSchema`, `stepCountIs`), Supabase, Vitest

---

## 선행 확인 (모두 완료)

- [x] chat/llm-client: callWithFallback (P2-5)
- [x] chat/prompts: buildSystemPrompt, SystemPromptContext (P2-6)
- [x] core/memory: loadRecentMessages, saveMessages (P2-8)
- [x] chat/tools/search-handler: executeSearchBeautyData, SearchToolContext (P2-20)
- [x] chat/tools/links-handler: executeGetExternalLinks, LinksToolContext (P2-21)
- [x] chat/tools/extraction-handler: executeExtractUserProfile, extractUserProfileSchema, ExtractionResult (P2-22)
- [x] shared/constants/ai: TOKEN_CONFIG (historyLimit: 20) (P2-1)

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| conversation 조회/생성: chatService 직접 | conversations = chat 도메인. profile/service.ts 직접 DB 패턴과 동일 | R-5, L-9, api-spec.md:835 |
| profile/journey: route에서 파라미터 수신 | 타 도메인 데이터 → Composition Root에서 전달 | P-4, L-3, R-9 |
| 비동기 후처리(step 9,11): chatService 범위 아님 | route handler(P-4)에서 onFinish 조합 | R-9, Q-15, auth-matrix.md:626-638 |
| callWithFallback: 기존 llm-client 사용 | stopWhen 지원은 callWithFallback에 옵션 추가로 해결 | P2-5 |
| tool 등록: AI SDK zodSchema + execute | PoC tools.ts 패턴 계승 (Zod 4 + zodSchema 워크어라운드) | tool-spec.md PoC 기반 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/chat/service.ts` | skeleton→구현 | 오케스트레이터: conversation + prompt + LLM + tools |
| `src/server/features/chat/service.test.ts` | 신규 | 단위 테스트 |
| `src/server/features/chat/llm-client.ts` | 수정 | stopWhen 옵션 추가 (CallOptions에 stopWhen 필드) |

## 의존성 방향 (R-5)

```
chat/service.ts (오케스트레이터)
  ├──→ chat/llm-client (같은 도메인)        R-5 ✓
  ├──→ chat/prompts (같은 도메인)           R-5 ✓
  ├──→ chat/tools/search-handler (같은 도메인) R-5 ✓
  ├──→ chat/tools/links-handler (같은 도메인)  R-5 ✓
  ├──→ chat/tools/extraction-handler (같은 도메인) R-5 ✓
  ├──→ core/memory (core/)                R-5 ✓
  ├──→ shared/constants/ai (shared/)      R-5 ✓
  ├──→ shared/types (type import)         R-5 ✓
  └──→ @supabase/supabase-js (type)

  ✗ features/profile → 금지 (R-9)
  ✗ features/journey → 금지 (R-9)
  ✗ repositories/ → 금지 (R-5: service는 tool에 위임)
  순환 참조 없음
```

**콜 스택 (P-5 ≤ 4)**:
```
route(①) → chatService(②) → callWithFallback → tool(③) → repository(④) ✓
```

## chatService 범위 (api-spec.md §3.4 step 3~8만)

| step | 내용 | 담당 |
|------|------|------|
| 1-2 | 인증 + client 생성 | **route (P2-23)** |
| 3 | conversation 조회/생성 | **chatService** (자기 도메인) |
| 4 | 히스토리 로드 | **chatService** → core/memory |
| 5 | 프로필 로드 | **route** → 파라미터 전달 (L-3) |
| 6 | 시스템 프롬프트 구성 | **chatService** → chat/prompts |
| 7 | LLM 호출 + tool_use | **chatService** → chat/llm-client + tools/ |
| 8 | 스트리밍 반환 | **chatService** → return stream |
| 9 | 히스토리 저장 (비동기) | **route onFinish** (Q-15) |
| 10 | 행동 로그 (비동기) | **route onFinish** → P2-26 |
| 11 | 추출 결과 저장 (비동기) | **route onFinish** (P-4, R-9) |

---

## Task 1: llm-client.ts 수정 — stopWhen 옵션 추가

**Files:**
- Modify: `src/server/features/chat/llm-client.ts`

api-spec.md §3.4 step 7: "streamText + tool_use, stopWhen: stepCountIs". 현재 CallOptions에 stopWhen이 없음. 추가 필요.

- [ ] **Step 1: CallOptions에 stopWhen 필드 추가**

```typescript
interface CallOptions {
  messages: unknown[];
  system: string;
  tools: Record<string, unknown>;
  stopWhen?: unknown;  // AI SDK stopWhen (stepCountIs 등)
}
```

streamText 호출에 이미 `...options` spread로 전달되므로 코드 변경 최소.

- [ ] **Step 2: 테스트 통과 확인**
- [ ] **Step 3: Commit**

---

## Task 2: chat/service.ts 구현

**Files:**
- Modify: `src/server/features/chat/service.ts` (skeleton→구현)

- [ ] **Step 1: service.ts 작성**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile, Journey, LearnedPreference, DerivedVariables } from '@/shared/types/profile';
import { zodSchema, stepCountIs } from 'ai';
import { z } from 'zod';
import { callWithFallback } from './llm-client';
import { buildSystemPrompt } from './prompts';
import { loadRecentMessages } from '@/server/core/memory';
import { TOKEN_CONFIG } from '@/shared/constants/ai';
import { executeSearchBeautyData, type SearchToolContext } from './tools/search-handler';
import { executeGetExternalLinks, type LinksToolContext } from './tools/links-handler';
import {
  executeExtractUserProfile,
  extractUserProfileSchema,
  type ExtractionResult,
} from './tools/extraction-handler';

// ============================================================
// Chat 서비스 — api-spec.md §3.4, TDD §4.2
// R-5: 자기 도메인(chat/) + core/ + shared/ ONLY.
// R-9: features/profile, features/journey import 금지. route에서 파라미터 수신 (P-4).
// L-9: 자기 도메인 범위 내에서만 동작.
// ============================================================

const MAX_TOOL_STEPS = 3;

/** route handler에서 전달하는 chat 요청 파라미터 */
export interface StreamChatParams {
  client: SupabaseClient;
  userId: string;
  conversationId: string | null;
  message: string;
  profile: UserProfile | null;         // L-3: route에서 조회하여 전달
  journey: Journey | null;             // L-3: route에서 조회하여 전달
  preferences: LearnedPreference[];    // L-3: route에서 조회하여 전달
  derived: DerivedVariables | null;    // L-3: route에서 조회하여 전달
}

/** streamChat 반환값 */
export interface StreamChatResult {
  stream: unknown;  // AI SDK StreamTextResult
  conversationId: string;
  extractionResults: ExtractionResult[];  // route onFinish에서 조건부 저장용
}

/**
 * Chat 오케스트레이터.
 * api-spec.md §3.4 step 3~8: conversation → history → prompt → LLM → stream.
 * 비동기 후처리 (step 9, 11)는 route handler 책임 (P-4, R-9, Q-15).
 */
export async function streamChat(params: StreamChatParams): Promise<StreamChatResult> {
  const { client, userId, message, profile, journey, preferences, derived } = params;

  // step 3: conversation 조회 또는 생성
  const conversationId = await getOrCreateConversation(client, userId, params.conversationId);

  // step 4: 히스토리 로드
  const historyLimit = TOKEN_CONFIG.default.historyLimit;
  const history = await loadRecentMessages(client, conversationId, historyLimit);

  // step 6: 시스템 프롬프트 구성
  const system = buildSystemPrompt({
    profile,
    journey,
    realtime: { location: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, current_time: new Date().toISOString() },
    derived,
    learnedPreferences: preferences,
  });

  // tool context (P-4: chatService가 조립하여 tool에 전달)
  const searchContext: SearchToolContext = { client, profile: profile ? { skin_type: profile.skin_type, hair_type: profile.hair_type, hair_concerns: profile.hair_concerns, country: profile.country, language: profile.language, age_range: profile.age_range } : null, journey: journey ? { skin_concerns: journey.skin_concerns, interest_activities: journey.interest_activities, stay_days: journey.stay_days, start_date: journey.start_date, end_date: journey.end_date, budget_level: journey.budget_level, travel_style: journey.travel_style } : null, preferences };
  const linksContext: LinksToolContext = { client };

  // 추출 결과 수집용
  const extractionResults: ExtractionResult[] = [];

  // step 7: tool 등록 + LLM 호출
  const tools = buildTools(searchContext, linksContext, extractionResults);

  const messages = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message },
  ];

  const stream = await callWithFallback({
    messages,
    system,
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  });

  return { stream, conversationId, extractionResults };
}

// --- 내부 함수 ---

/** conversation 조회 또는 생성. chat 자기 도메인 (R-5). */
async function getOrCreateConversation(
  client: SupabaseClient,
  userId: string,
  conversationId: string | null,
): Promise<string> {
  if (conversationId) {
    const { data, error } = await client
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error('Conversation not found');
    }
    return data.id;
  }

  const { data, error } = await client
    .from('conversations')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create conversation');
  }
  return data.id;
}

// --- search_beauty_data tool input schema (tool-spec.md §1) ---
const searchBeautyDataSchema = z.object({
  query: z.string().describe('Search query in natural language'),
  domain: z.enum(['shopping', 'treatment']).describe('shopping = products+stores, treatment = procedures+clinics'),
  filters: z.object({
    skin_types: z.array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])).optional(),
    concerns: z.array(z.string()).optional(),
    category: z.string().optional(),
    budget_max_krw: z.number().optional(),
    max_downtime: z.number().optional(),
    english_support: z.enum(['none', 'basic', 'good', 'fluent']).optional(),
  }).optional(),
  limit: z.number().optional().default(3),
});

// --- get_external_links tool input schema (tool-spec.md §2) ---
const getExternalLinksSchema = z.object({
  entity_id: z.string().describe('ID of the entity'),
  entity_type: z.enum(['product', 'store', 'clinic', 'treatment']).describe('Type of entity'),
});

/** 3개 tool 등록. AI SDK zodSchema + execute 패턴 (PoC tools.ts 계승). */
function buildTools(
  searchContext: SearchToolContext,
  linksContext: LinksToolContext,
  extractionResults: ExtractionResult[],
): Record<string, { description: string; inputSchema: unknown; execute: (args: unknown) => Promise<unknown> }> {
  return {
    search_beauty_data: {
      description: 'Search K-beauty products or treatments matching user criteria. Returns recommendation cards.',
      inputSchema: zodSchema(searchBeautyDataSchema),
      execute: async (args: unknown) => executeSearchBeautyData(args as Parameters<typeof executeSearchBeautyData>[0], searchContext),
    },
    get_external_links: {
      description: 'Get purchase, booking, or map links for a product, store, clinic, or treatment.',
      inputSchema: zodSchema(getExternalLinksSchema),
      execute: async (args: unknown) => executeGetExternalLinks(args as Parameters<typeof executeGetExternalLinks>[0], linksContext),
    },
    extract_user_profile: {
      description: 'Extract beauty profile info mentioned by user. Call when user mentions skin type, concerns, budget, travel plans.',
      inputSchema: zodSchema(extractUserProfileSchema),
      execute: async (args: unknown) => {
        const result = await executeExtractUserProfile(args);
        if (!('status' in result)) {
          extractionResults.push(result);
        }
        return result;
      },
    },
  };
}
```

- [ ] **Step 2: Commit**

---

## Task 3: 테스트 작성 + 실행

**Files:**
- Create: `src/server/features/chat/service.test.ts`

**테스트 케이스 (7개)**:

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | streamChat: 기존 conversation → 히스토리 로드 + LLM 호출 | |
| 2 | streamChat: 새 conversation (id=null) → 생성 + 반환 | |
| 3 | streamChat: 프로필 null (VP-3) → 기본 프롬프트로 동작 | |
| 4 | getOrCreateConversation: 미존재 ID → throw | |
| 5 | tools 등록: 3개 tool 키 존재 | |
| 6 | extract_user_profile execute → extractionResults에 수집 | |
| 7 | extraction_skipped → extractionResults에 미수집 | |

- [ ] **Step 1: 테스트 작성**
- [ ] **Step 2: 테스트 실행**
- [ ] **Step 3: 전체 테스트 실행**
- [ ] **Step 4: Commit**

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: service → chat/* + core/memory + shared/ ONLY (R-5)
[ ] V-2  features/chat/llm-client.ts 수정: CallOptions에 stopWhen 추가 (core/ 아님, L-4 승인 불필요)
[ ] V-3  cross-domain: profile/journey는 route에서 파라미터 수신 (L-3, P-4)
[ ] V-4  features 독립: profile/journey service import 없음 (R-9)
[ ] V-5  콜 스택 ≤ 4: route→chatService→callWithFallback→tool→repository
[ ] V-8  순환 없음
[ ] V-17 제거 안전성
```

### 품질

```
[ ] R-5  service import 범위: 자기 도메인 + core/ + shared/
[ ] R-9  타 도메인 service import 없음
[ ] L-9  자기 도메인 범위만
[ ] Q-7  에러 불삼킴
[ ] Q-15 비동기 쓰기: chatService 범위 아님 (route에서 처리)
[ ] G-9  export: streamChat + StreamChatParams + StreamChatResult (3개)
[ ] G-10 MAX_TOOL_STEPS 상수
[ ] VP-3 profile/journey null 허용
```

## export 범위 (G-9)

| export | 소비자 |
|--------|--------|
| `streamChat()` | route handler (P2-23) |
| `StreamChatParams` | route handler (P2-23) |
| `StreamChatResult` | route handler (P2-23) — extractionResults 접근용 |

3개 export. 내부: getOrCreateConversation, buildTools, searchBeautyDataSchema, getExternalLinksSchema, MAX_TOOL_STEPS (L-14).
