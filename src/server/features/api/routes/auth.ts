import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import { createAnonymousSession } from '@/server/features/auth/service';

// ============================================================
// POST /api/auth/anonymous — api-spec.md §2.1
// auth-matrix.md §2.4: 공개 엔드포인트 (인증 없음).
// api-spec.md §4.1: Rate limit 3회/분, IP 기준 (rateLimit 미들웨어가 IP 폴백 처리).
// ============================================================

const anonymousAuthBodySchema = z.object({
  consent: z.object({
    data_retention: z.literal(true, {
      message: 'data_retention consent is required',
    }),
  }),
});

const anonymousAuthResponseSchema = z.object({
  data: z.any(),
  meta: z.object({ timestamp: z.string() }),
});

const postAnonymousRoute = createRoute({
  method: 'post',
  path: '/api/auth/anonymous',
  summary: 'Create anonymous session',
  request: {
    body: {
      content: { 'application/json': { schema: anonymousAuthBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: anonymousAuthResponseSchema } },
      description: 'Anonymous session created',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Validation failed',
    },
    429: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Rate limit exceeded',
    },
    500: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Session creation failed',
    },
  },
});

export function registerAuthRoutes(app: AppType) {
  // IP 기준 rate limit — anon_create 3/분 (사용자 미인증이므로 미들웨어가 IP 폴백 사용)
  app.use('/api/auth/anonymous', rateLimit('anon_create', 3, 60_000));

  app.openapi(postAnonymousRoute, async (c) => {
    const body = c.req.valid('json');

    try {
      // zod 검증 통과 = data_retention은 반드시 true
      const result = await createAnonymousSession({ data_retention: true });
      return c.json(
        { data: result, meta: { timestamp: new Date().toISOString() } },
        201,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'AUTH_SESSION_CREATION_FAILED',
            message: 'Failed to create session',
            details: null,
          },
        },
        500,
      );
    }
  });
}
