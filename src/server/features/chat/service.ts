import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile, Journey, LearnedPreference, DerivedVariables } from '@/shared/types/profile';
import type { ModelMessage } from 'ai';
import { tool } from 'ai';
import { callWithFallback } from './llm-client';
import { buildSystemPrompt } from './prompts';
import { executeSearchBeautyData, searchBeautyDataSchema, type SearchToolContext } from './tools/search-handler';
import { executeGetExternalLinks, getExternalLinksSchema, type LinksToolContext } from './tools/links-handler';
import {
  executeExtractUserProfile,
  extractUserProfileSchema,
  type ExtractionResult,
} from './tools/extraction-handler';
import { executeLookupBeautyKnowledge, lookupBeautyKnowledgeSchema } from './tools/knowledge-handler';
import { TOKEN_CONFIG } from '@/shared/constants/ai';

// ============================================================
// Chat 서비스 — api-spec.md §3.4, TDD §4.2
// R-5: 자기 도메인(chat/) + core/ + shared/ ONLY.
// R-9: features/profile, features/journey import 금지. route에서 파라미터 수신 (P-4).
// L-9: 자기 도메인 범위 내에서만 동작.
// ============================================================
// v1.1: MAX_TOOL_STEPS 하드코딩 제거 → TOKEN_CONFIG.default.maxToolSteps 참조
// (G-10 매직 넘버 금지, chat-quality-improvements.md §4)

/** route handler에서 전달하는 chat 요청 파라미터 */
export interface StreamChatParams {
  client: SupabaseClient;
  userId: string;
  conversationId: string | null;
  message: string;
  history: ModelMessage[];             // L-3: route에서 UIMessage[] → convertToModelMessages() 변환하여 전달
  profile: UserProfile | null;         // L-3: route에서 조회하여 전달
  journey: Journey | null;             // L-3: route에서 조회하여 전달
  preferences: LearnedPreference[];    // L-3: route에서 조회하여 전달
  derived: DerivedVariables | null;    // L-3: route에서 조회하여 전달
  locale: string;                      // URL locale (en|ko). 시스템 프롬프트 언어 지시에 사용.
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

  // step 6: 시스템 프롬프트 구성
  const system = buildSystemPrompt({
    profile,
    journey,
    realtime: {
      location: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      current_time: new Date().toISOString(),
    },
    derived,
    learnedPreferences: preferences,
    isFirstTurn: params.history.length === 0,
    locale: params.locale,
  });

  // tool context (P-4: chatService가 조립하여 tool에 전달)
  const searchContext: SearchToolContext = {
    client,
    profile: profile
      ? {
          skin_types: profile.skin_types ?? [],
          hair_type: profile.hair_type,
          hair_concerns: profile.hair_concerns,
          country: profile.country,
          language: profile.language,
          age_range: profile.age_range,
        }
      : null,
    journey: journey
      ? {
          skin_concerns: journey.skin_concerns,
          interest_activities: journey.interest_activities,
          stay_days: journey.stay_days,
          start_date: journey.start_date,
          end_date: journey.end_date,
          budget_level: journey.budget_level,
          travel_style: journey.travel_style,
        }
      : null,
    preferences,
  };
  const linksContext: LinksToolContext = { client };

  // 추출 결과 수집용
  const extractionResults: ExtractionResult[] = [];

  // step 7: tool 등록 + LLM 호출
  const tools = buildTools(searchContext, linksContext, extractionResults);

  // step 4: 히스토리 트리밍 (NEW-4: 토큰 관리) + 새 메시지 조합
  const trimmedHistory = params.history.length > TOKEN_CONFIG.default.historyLimit
    ? params.history.slice(-TOKEN_CONFIG.default.historyLimit)
    : params.history;

  const messages: ModelMessage[] = [
    ...trimmedHistory,
    { role: 'user' as const, content: message },
  ];

  const stream = await callWithFallback({
    messages,
    system,
    tools,
    // NEW-30: stepCountIs(n)는 steps.length === n strict equality (ai@6.0.x).
    // 예상치 못한 step 초과 시 중단되지 않아 tool 루프 폭주 → >=로 변경.
    stopWhen: ({ steps }) => steps.length >= TOKEN_CONFIG.default.maxToolSteps,
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
    return (data as { id: string }).id;
  }

  const { data, error } = await client
    .from('conversations')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create conversation');
  }
  return (data as { id: string }).id;
}

/** tool 등록. AI SDK tool() 헬퍼 패턴. P-4: 조합 루트. */
function buildTools(
  searchContext: SearchToolContext,
  linksContext: LinksToolContext,
  extractionResults: ExtractionResult[],
) {
  return {
    search_beauty_data: tool({
      description: 'Search K-beauty products or treatments matching user criteria. Returns recommendation cards.',
      inputSchema: searchBeautyDataSchema,
      execute: async (args) => executeSearchBeautyData(args, searchContext),
    }),
    get_external_links: tool({
      description: 'Get purchase, booking, or map links for a product, store, clinic, or treatment.',
      inputSchema: getExternalLinksSchema,
      execute: async (args) => executeGetExternalLinks(args, linksContext),
    }),
    extract_user_profile: tool({
      description: 'Extract beauty profile info mentioned by user. Call when user mentions skin type, concerns, budget, travel plans.',
      inputSchema: extractUserProfileSchema,
      execute: async (args) => {
        const result = await executeExtractUserProfile(args);
        if (!('status' in result)) {
          extractionResults.push(result);
        }
        return result;
      },
    }),
    lookup_beauty_knowledge: tool({
      description: 'Look up detailed K-beauty knowledge about a specific ingredient or treatment.',
      inputSchema: lookupBeautyKnowledgeSchema,
      execute: async (args) => executeLookupBeautyKnowledge(args),
    }),
  };
}
