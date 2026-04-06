import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import { registerAnonymousUser } from '@/server/features/auth/service';

// ============================================================
// POST /api/auth/anonymous — api-spec.md §2.1
// P2-79: requireAuth 미들웨어 추가 (클라이언트 SDK 세션 생성 후 인증된 상태에서 동의 기록).
// auth-matrix.md §2.4: requireAuth.
// api-spec.md §4.1: Rate limit 3회/분, IP 기준 (rateLimit 미들웨어가 IP 폴백 처리).
// L-21: Composition Root 역할 — 인증에서 userId 추출 → service 호출.
// ============================================================

const anonymousAuthBodySchema = z.object({
  consent: z.object({
    data_retention: z.literal(true, {
      message: 'data_retention consent is required',
    }),
  }),
});

const anonymousAuthResponseSchema = z.object({
  data: z.object({ user_id: z.string() }),
  meta: z.object({ timestamp: z.string() }),
});

const postAnonymousRoute = createRoute({
  method: 'post',
  path: '/api/auth/anonymous',
  summary: 'Register anonymous user and record consent',
  request: {
    body: {
      content: { 'application/json': { schema: anonymousAuthBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: anonymousAuthResponseSchema } },
      description: 'Anonymous user registered',
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
      description: 'Registration failed',
    },
  },
});

export function registerAuthRoutes(app: AppType) {
  // IP 기준 rate limit — anon_create 3/분 (rateLimit 미들웨어가 IP 폴백 사용)
  app.use('/api/auth/anonymous', rateLimit('anon_create', 3, 60_000));
  // P2-79: requireAuth — 클라이언트 SDK 세션 생성 후 인증된 상태에서만 동의 기록
  app.use('/api/auth/anonymous', requireAuth());

  app.openapi(postAnonymousRoute, async (c) => {
    const body = c.req.valid('json');
    const userId = c.get('user')!.id;

    try {
      // L-21: Composition Root — 인증에서 userId 추출 → service에 파라미터 전달
      const result = await registerAnonymousUser(userId, { data_retention: body.consent.data_retention });
      return c.json(
        { data: result, meta: { timestamp: new Date().toISOString() } },
        201,
      );
    } catch (error) {
      console.error('[auth/anonymous] registration failed', String(error));
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
