import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import type { UserProfile, Journey } from '@/shared/types/profile';
import { getProfile } from '@/server/features/profile/service';
import { getActiveJourney } from '@/server/features/journey/service';
import { streamChat } from '@/server/features/chat/service';
import { loadRecentMessages } from '@/server/core/memory';
import { TOKEN_CONFIG } from '@/shared/constants/ai';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

// ============================================================
// POST /api/chat      — api-spec.md §3.1 (SSE streaming, app.post() NOT openapi)
// GET  /api/chat/history — api-spec.md §2.6
// P-4: Composition Root — profile + journey + chat service 조합.
// Q-15: 비동기 후처리 격리 (추출 결과 저장).
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

// ── Chat history GET ──────────────────────────────────────────

/** Q-1: 쿼리 파라미터 검증 */
const historyQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

const historyResponseSchema = z.object({
  data: z.object({
    messages: z.array(z.any()),
    conversation_id: z.string().nullable(),
  }),
});

const getChatHistoryRoute = createRoute({
  method: 'get',
  path: '/api/chat/history',
  summary: 'Get recent chat history',
  request: {
    query: historyQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: historyResponseSchema } },
      description: 'History retrieved',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Validation failed',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Authentication required',
    },
    429: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Rate limit exceeded',
    },
    500: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Load failed',
    },
  },
});

export function registerChatRoutes(app: AppType) {
  // ── GET /api/chat/history ─────────────────────────────────
  app.use('/api/chat/history', requireAuth());
  app.use('/api/chat/history', rateLimit('public', 60, 60_000));

  app.openapi(getChatHistoryRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const query = c.req.valid('query');

    try {
      // conversation_id 확인 (없으면 최신 대화 조회)
      let conversationId = query.conversation_id;

      if (!conversationId) {
        const { data: latest } = await client
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latest) {
          // 대화 없음 → 빈 배열 반환
          return c.json(
            { data: { messages: [], conversation_id: null } },
            200,
          );
        }
        conversationId = (latest as { id: string }).id;
      }

      // 히스토리 로드 — core/memory 재사용
      const historyLimit = TOKEN_CONFIG.default.historyLimit;
      const rawMessages = await loadRecentMessages(client, conversationId, historyLimit);

      // api-spec.md §2.6: role, content, card_data, created_at만 반환. tool_calls 미포함.
      const messages = rawMessages.map(({ role, content, card_data, created_at }: {
        role: unknown;
        content: unknown;
        card_data: unknown;
        created_at: unknown;
      }) => ({
        role, content, card_data, created_at,
      }));

      return c.json(
        { data: { messages, conversation_id: conversationId } },
        200,
      );
    } catch (error) {
      console.error('[chat/history] load failed', String(error));
      return c.json(
        {
          error: {
            code: 'HISTORY_LOAD_FAILED',
            message: 'Failed to load chat history',
            details: null,
          },
        },
        500,
      );
    }
  });

  // ── POST /api/chat — SSE streaming (app.post() NOT app.openapi()) ─
  // honojs/middleware#735: SSE 스트리밍은 app.post() 사용
  app.use('/api/chat', requireAuth());
  // Chat dual rate limit: 5/min (chat_min) + 100/day (chat_day)
  app.use('/api/chat', rateLimit('chat', 5, 60_000));
  app.use('/api/chat', rateLimit('chat', 100, 24 * 60 * 60_000));

  app.post('/api/chat', async (c) => {
    const user = c.get('user')!;

    // 입력 검증 (Q-1)
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body', details: null } },
        400,
      );
    }

    /** Q-1: zod 입력 검증 — api-spec.md §3.1 */
    const chatRequestSchema = z.object({
      message: z.string().min(1).max(4000),
      conversation_id: z.string().uuid().nullable().optional(),
    });

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: parsed.error.issues[0]?.message ?? 'Validation failed',
            details: null,
          },
        },
        400,
      );
    }

    // DB 클라이언트 (RLS 적용)
    const client = c.get('client') as DbClient;

    // Cross-domain 데이터 조회 (L-3, P-4)
    // ProfileRow/JourneyRow → UserProfile/Journey 타입 단언
    const [profile, journey] = await Promise.all([
      getProfile(client, user.id).catch(() => null) as Promise<UserProfile | null>,
      getActiveJourney(client, user.id).catch(() => null) as Promise<Journey | null>,
    ]);

    // learned_preferences 조회 (P2-26 미구현 → 직접 조회)
    const { data: preferencesData } = await client
      .from('learned_preferences')
      .select('*')
      .eq('user_id', user.id);
    const preferences = preferencesData ?? [];

    // chatService 호출
    try {
      const result = await streamChat({
        client,
        userId: user.id,
        conversationId: parsed.data.conversation_id ?? null,
        message: parsed.data.message,
        profile,
        journey,
        preferences,
        derived: null, // MVP: DV-4 미구현. beauty/ DV-1/2는 search-handler 내부 계산.
      });

      // 비동기 후처리 (Q-15: 격리. 실패해도 응답 무영향)
      // auth-matrix.md §5.4: service_role 사용 (토큰 만료 대비)
      const afterWork = async () => {
        try {
          const serviceClient = createServiceClient();

          // TODO(P2-24): step 9 히스토리 저장 — AI SDK onFinish 콜백에서 saveMessages 호출
          // TODO(P2-26): step 10 행동 로그 — behavior service에서 처리

          // step 11: 추출 결과 조건부 저장
          if (result.extractionResults.length > 0 && profile) {
            for (const extraction of result.extractionResults) {
              if (extraction.skin_type) {
                await serviceClient
                  .from('user_profiles')
                  .update({ skin_type: extraction.skin_type })
                  .eq('user_id', user.id);
              }
            }
          }
        } catch (error) {
          console.error('[chat/after] async post-processing failed', String(error));
        }
      };

      // Q-15: 비동기 실행 — 응답 반환 후 처리
      void afterWork();

      // SSE 스트리밍 반환 — api-spec.md §3.2
      const stream = result.stream as { toUIMessageStreamResponse: () => Response };
      return stream.toUIMessageStreamResponse();
    } catch (error) {
      // MVP: CHAT_LLM_TIMEOUT vs CHAT_LLM_ERROR 미구분.
      // callWithFallback이 timeout을 AbortError로 throw하지만 구분 없이 500 반환.
      // v0.2: AbortError 감지 → CHAT_LLM_TIMEOUT (408) 분리.
      console.error('[chat] streamChat failed', String(error));
      return c.json(
        { error: { code: 'CHAT_LLM_ERROR', message: 'Failed to process chat request', details: null } },
        500,
      );
    }
  });
}
