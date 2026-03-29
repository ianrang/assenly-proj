import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import { createAuthenticatedClient } from '@/server/core/db';

// ============================================================
// POST /api/events — api-spec.md §2.7
// ANALYTICS.md §3.2: 4개 클라이언트 이벤트 타입.
// Q-15: DB INSERT 실패 시 응답에 영향 없음 (fire-and-forget).
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

/** 이벤트별 metadata 스키마 — ANALYTICS.md §3.2 */
const metadataSchemas: Record<string, z.ZodType> = {
  path_a_entry: z.object({
    source: z.literal('landing'),
  }),
  card_exposure: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    position: z.number().int().nonnegative(),
    conversation_id: z.string().uuid(),
  }),
  card_click: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    conversation_id: z.string().uuid(),
  }),
  external_link_click: z.object({
    card_id: z.string().min(1),
    link_type: z.enum(['naver_map', 'kakao_map', 'website', 'purchase', 'booking', 'phone']),
    url: z.string().url(),
    conversation_id: z.string().uuid(),
  }),
  // kit_cta_submit: 서버 전용 (api-spec.md §2.7 line 400). POST /api/kit/claim에서 직접 기록.
};

const VALID_EVENT_TYPES = Object.keys(metadataSchemas);

const VALID_TARGET_TYPES = ['product', 'store', 'clinic', 'treatment', 'card', 'link'] as const;

/** Q-1: 단일 이벤트 스키마 */
const eventSchema = z.object({
  event_type: z.string().refine(t => VALID_EVENT_TYPES.includes(t), { message: 'Invalid event_type' }),
  target_id: z.string().uuid().nullable().optional(),
  target_type: z.enum(VALID_TARGET_TYPES).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Q-1: 요청 전체 스키마 */
const eventsBodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

const eventsResponseSchema = z.object({
  data: z.object({ recorded: z.number() }),
});

const postEventsRoute = createRoute({
  method: 'post',
  path: '/api/events',
  summary: 'Record client-side analytics events',
  request: {
    body: {
      content: { 'application/json': { schema: eventsBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: eventsResponseSchema } },
      description: 'Events recorded',
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
  },
});

export function registerEventRoutes(app: AppType) {
  app.use('/api/events', requireAuth());
  app.use('/api/events', rateLimit('public', 60, 60_000));

  app.openapi(postEventsRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const parsed = c.req.valid('json');

    // 이벤트별 metadata 검증
    const validEvents: Array<{
      user_id: string;
      event_type: string;
      target_id: string | null;
      target_type: string | null;
      metadata: unknown;
    }> = [];

    for (const event of parsed.events) {
      const metaSchema = metadataSchemas[event.event_type];
      if (metaSchema) {
        // ANALYTICS.md §3.1: 모든 이벤트는 metadata 필수
        if (!event.metadata) continue; // metadata 없음 → 스킵
        const metaResult = metaSchema.safeParse(event.metadata);
        if (!metaResult.success) continue; // 잘못된 metadata → 스킵
      }

      validEvents.push({
        user_id: user.id,
        event_type: event.event_type,
        target_id: event.target_id ?? null,
        target_type: event.target_type ?? null,
        metadata: event.metadata ?? null,
      });
    }

    if (validEvents.length === 0) {
      return c.json({ data: { recorded: 0 } }, 200);
    }

    // bulk INSERT — Q-15: fire-and-forget (부분 실패 허용)
    try {
      const { error } = await client
        .from('behavior_logs')
        .insert(validEvents);

      if (error) {
        console.error('[events] bulk insert failed', String(error));
        // Q-15: 실패해도 응답은 정상 반환 (fire-and-forget 정신)
        return c.json({ data: { recorded: 0 } }, 200);
      }
    } catch (error) {
      console.error('[events] unexpected error', String(error));
      return c.json({ data: { recorded: 0 } }, 200);
    }

    return c.json({ data: { recorded: validEvents.length } }, 200);
  });
}
