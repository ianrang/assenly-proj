import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import type { UserProfile, Journey } from '@/shared/types/profile';
import type { UIMessage, StreamTextResult, ToolSet } from 'ai';
import { type Output } from 'ai';
import { convertToModelMessages } from 'ai';
import { getProfile, createMinimalProfile, updateProfile } from '@/server/features/profile/service';
import { getActiveJourney } from '@/server/features/journey/service';
import { streamChat } from '@/server/features/chat/service';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { env } from '@/server/core/config';

// ============================================================
// POST /api/chat      — api-spec.md §3.1 (SSE streaming, app.post() NOT openapi)
// GET  /api/chat/history — api-spec.md §2.6
// P-4: Composition Root — profile + journey + history + chat service 조합.
// Q-15: 비동기 후처리 격리 (onFinish: UIMessage[] 저장 + 추출 결과 저장).
// P2-50b: 서버 권위적 히스토리 — DB에서 UIMessage[] 로드 → convertToModelMessages → service.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

// ── Chat history GET ──────────────────────────────────────────

/** Q-1: 쿼리 파라미터 검증 */
const historyQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

const historyResponseSchema = z.object({
  data: z.object({
    messages: z.array(z.unknown()),
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
          return c.json(
            { data: { messages: [], conversation_id: null } },
            200,
          );
        }
        conversationId = (latest as { id: string }).id;
      }

      // P2-50b: conversations.ui_messages 직접 조회 (UIMessage[] 스냅샷)
      const { data: conv, error } = await client
        .from('conversations')
        .select('ui_messages')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        return c.json(
          { data: { messages: [], conversation_id: conversationId } },
          200,
        );
      }

      return c.json(
        { data: { messages: conv?.ui_messages ?? [], conversation_id: conversationId } },
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
  // Chat dual rate limit: 15/min (chat_min) + 100/day (chat_day)
  app.use('/api/chat', rateLimit('chat', 15, 60_000));
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

    // Q-1: zod 입력 검증. G-8: any 금지. user message parts는 text만 허용.
    // AI SDK prepareSendMessagesRequest에서 보내는 형식.
    const chatRequestSchema = z.object({
      message: z.object({
        id: z.string(),
        role: z.literal('user'),
        parts: z.array(z.object({
          type: z.literal('text'),
          text: z.string().min(1).max(4000),
        })).min(1),
      }),
      conversation_id: z.string().uuid().nullable().optional(),
      locale: z.enum(['en', 'ko']).default('en'),
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
    const clientMessage = parsed.data.message as UIMessage;

    // 새 메시지 텍스트 추출 (service.ts에 전달)
    const userMessageText = parsed.data.message.parts
      .map((p) => p.text)
      .join('\n');

    // P2-50b: DB에서 신뢰할 수 있는 히스토리 로드 (서버 권위적)
    let storedUIMessages: UIMessage[] = [];
    const conversationId = parsed.data.conversation_id ?? null;

    if (conversationId) {
      try {
        const { data: conv } = await client
          .from('conversations')
          .select('ui_messages')
          .eq('id', conversationId)
          .eq('user_id', user.id)
          .single();

        // 방어: null/비배열 → 빈 배열 폴백
        const raw = conv?.ui_messages;
        storedUIMessages = Array.isArray(raw) ? (raw as UIMessage[]) : [];
      } catch {
        // 조회 실패 → 빈 히스토리로 진행 (첫 턴과 동일 동작)
        storedUIMessages = [];
      }
    }

    // L-21 Composition Root: UIMessage[] → ModelMessage[] 변환 (LLM 컨텍스트용)
    // 방어: 손상된 ui_messages → 빈 히스토리 폴백
    let history: Awaited<ReturnType<typeof convertToModelMessages>> = [];
    try {
      history = await convertToModelMessages(storedUIMessages);
    } catch {
      console.error('[chat] convertToModelMessages failed, fallback to empty history');
    }

    // Cross-domain 데이터 조회 (L-3, P-4)
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
        conversationId,
        message: userMessageText,
        history,
        profile,
        journey,
        preferences,
        derived: null, // MVP: DV-4 미구현. beauty/ DV-1/2는 search-handler 내부 계산.
        locale: parsed.data.locale,
      });

      // P2-50b: consumeStream — 클라이언트 연결 끊김 시에도 onFinish 보장
      // fire-and-forget. 내부적으로 스트림을 tee하여 별도 브랜치로 소비.
      const stream = result.stream as StreamTextResult<ToolSet, Output.Output<string, string, never>>;
      stream.consumeStream();

      // originalMessages: DB 히스토리 + 새 클라이언트 메시지
      const originalMessages: UIMessage[] = [...storedUIMessages, clientMessage];

      // SSE 스트리밍 반환 — api-spec.md §3.2
      return stream.toUIMessageStreamResponse({
        originalMessages,

        // P2-50b: conversationId를 클라이언트에 전달 (messageMetadata)
        messageMetadata: ({ part }) => {
          if (part.type === 'start') {
            return { conversationId: result.conversationId };
          }
          return undefined;
        },

        // P2-50b: onFinish — UIMessage[] 저장 + 추출 결과 저장
        // 기존 afterWork 로직 통합 (레이스 컨디션 수정: tool 실행 완료 후 실행 보장)
        onFinish: async ({ messages: finalMessages }) => {
          try {
            // P3-29a: LLM 토큰 사용량 로그 (Vercel Logs 가시성). v0.2: DB 기반 집계.
            try {
              const usage = await stream.usage;
              console.warn('[LLM_USAGE]', {
                conversationId: result.conversationId,
                provider: env.AI_PROVIDER,
                tokens: usage,
              });
            } catch {
              // usage 조회 실패해도 후처리 진행 (Q-15)
            }

            // auth-matrix.md §5.4: service_role 사용 (토큰 만료 대비)
            const serviceClient = createServiceClient();

            // step 9: UIMessage[] 스냅샷 저장 (defense-in-depth: user_id 방어 조건)
            // v1.2 수정 (adversarial review): { count: 'exact' } 옵션으로 업데이트 행 수 체크.
            // Supabase .update()는 WHERE 미매치 시 error=null, count=0을 반환하므로
            // saveErr만으로는 silent drop을 감지할 수 없음. user_id mismatch 시 명시 로깅.
            const { error: saveErr, count: savedCount } = await serviceClient
              .from('conversations')
              .update({ ui_messages: finalMessages }, { count: 'exact' })
              .eq('id', result.conversationId)
              .eq('user_id', user.id);
            if (saveErr) {
              console.error('[chat/onFinish] ui_messages save failed', saveErr.message);
            } else if (savedCount === 0) {
              // id는 존재하지만 user_id 불일치 → silent drop 방지
              console.error('[CONVERSATION_SAVE_MISMATCH]', {
                conversationId: result.conversationId,
                userId: user.id,
                reason: 'user_id mismatch or conversation not found — silent drop prevented',
              });
            }

            // step 11: 추출 결과 저장 (Chat-First 온보딩 — mvp-flow-redesign.md §2.1)
            if (result.extractionResults.length > 0) {
              // 프로필 미존재 시 최소 프로필 생성 (Chat-First: 온보딩 스킵 가능)
              if (!profile) {
                try {
                  await createMinimalProfile(serviceClient, user.id, parsed.data.locale);
                } catch {
                  // PK 충돌 = 동시 요청으로 이미 생성됨 → updateProfile로 진행
                }
              }

              // 추출된 필드 집계 (마지막 추출 결과 우선)
              const updates: Record<string, unknown> = {};
              for (const extraction of result.extractionResults) {
                if (extraction.skin_type !== null) updates.skin_type = extraction.skin_type;
                if (extraction.age_range !== null) updates.age_range = extraction.age_range;
              }

              if (Object.keys(updates).length > 0) {
                await updateProfile(serviceClient, user.id, updates);
              }
            }
          } catch (error) {
            // Q-15: 비동기 쓰기 격리. 실패해도 사용자 응답 무영향.
            console.error('[chat/onFinish] post-processing failed', String(error));
          }
        },
      });
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
