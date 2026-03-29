import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import { getProfile, updateProfile, upsertProfile } from '@/server/features/profile/service';
import { getActiveJourney, createOrUpdateJourney } from '@/server/features/journey/service';
import { createAuthenticatedClient } from '@/server/core/db';

// ============================================================
// POST /api/profile/onboarding — api-spec.md §2.3
// GET  /api/profile — api-spec.md §2.3 + B.2 재방문 감지
// PUT  /api/profile — api-spec.md §2.3 부분 업데이트
// P-4: Composition Root — profile + journey 합성.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

// ── Onboarding ────────────────────────────────────────────────

/** Q-1, Q-14: zod 입력 검증 — DB 스키마 열거값과 일치 */
const onboardingBodySchema = z.object({
  // user_profiles 필드 (UP 변수)
  skin_type: z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']),
  hair_type: z
    .enum(['straight', 'wavy', 'curly', 'coily'])
    .nullable()
    .optional(),
  hair_concerns: z
    .array(
      z.enum([
        'damage',
        'thinning',
        'oily_scalp',
        'dryness',
        'dandruff',
        'color_treated',
      ]),
    )
    .default([]),
  country: z.string().min(2).max(2),
  language: z.enum(['en', 'ja', 'zh', 'es', 'fr', 'ko']).default('en'),
  age_range: z
    .enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
    .optional(),

  // journeys 필드 (JC 변수)
  skin_concerns: z
    .array(
      z.enum([
        'acne',
        'wrinkles',
        'dark_spots',
        'redness',
        'dryness',
        'pores',
        'dullness',
        'dark_circles',
        'uneven_tone',
        'sun_damage',
        'eczema',
      ]),
    )
    .max(5),
  interest_activities: z
    .array(z.enum(['shopping', 'clinic', 'salon', 'dining', 'cultural']))
    .min(1),
  stay_days: z.number().int().positive(),
  start_date: z.string().date().optional(),
  budget_level: z.enum(['budget', 'moderate', 'premium', 'luxury']),
  travel_style: z
    .array(
      z.enum([
        'efficient',
        'relaxed',
        'adventurous',
        'instagram',
        'local_experience',
        'luxury',
        'budget',
      ]),
    )
    .default([]),
});

const onboardingResponseSchema = z.object({
  data: z.object({ profile_id: z.string(), journey_id: z.string() }),
  meta: z.object({ timestamp: z.string() }),
});

const postOnboardingRoute = createRoute({
  method: 'post',
  path: '/api/profile/onboarding',
  summary: 'Submit onboarding data (profile + journey)',
  request: {
    body: {
      content: { 'application/json': { schema: onboardingBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: onboardingResponseSchema } },
      description: 'Onboarding saved',
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
      description: 'Save failed',
    },
  },
});

// ── Profile GET / PUT ─────────────────────────────────────────

/** Q-1, Q-14: PUT 부분 업데이트 스키마 — DB 스키마와 일치 */
const updateBodySchema = z
  .object({
    skin_type: z
      .enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])
      .optional(),
    hair_type: z
      .enum(['straight', 'wavy', 'curly', 'coily'])
      .nullable()
      .optional(),
    hair_concerns: z
      .array(
        z.enum([
          'damage',
          'thinning',
          'oily_scalp',
          'dryness',
          'dandruff',
          'color_treated',
        ]),
      )
      .optional(),
    country: z.string().min(2).max(2).optional(),
    language: z.enum(['en', 'ja', 'zh', 'es', 'fr', 'ko']).optional(),
    age_range: z
      .enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });

const profileResponseSchema = z.object({
  data: z.object({
    profile: z.any(),
    active_journey: z.any().nullable(),
  }),
  meta: z.object({ timestamp: z.string() }),
});

const updateResponseSchema = z.object({
  data: z.object({ updated: z.literal(true) }),
  meta: z.object({ timestamp: z.string() }),
});

const getProfileRoute = createRoute({
  method: 'get',
  path: '/api/profile',
  summary: 'Get user profile + active journey',
  responses: {
    200: {
      content: { 'application/json': { schema: profileResponseSchema } },
      description: 'Profile retrieved',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Authentication required',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Profile not found',
    },
    429: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Rate limit exceeded',
    },
    500: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Retrieval failed',
    },
  },
});

const putProfileRoute = createRoute({
  method: 'put',
  path: '/api/profile',
  summary: 'Update user profile (partial)',
  request: {
    body: {
      content: { 'application/json': { schema: updateBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: updateResponseSchema } },
      description: 'Profile updated',
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
      description: 'Update failed',
    },
  },
});

export function registerProfileRoutes(app: AppType) {
  // ── /api/profile/onboarding ───────────────────────────────
  app.use('/api/profile/onboarding', requireAuth());
  app.use('/api/profile/onboarding', rateLimit('profile_onboarding', 60, 60_000));

  app.openapi(postOnboardingRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const parsed = c.req.valid('json');

    // 필드 분리 (L-1: route 책임)
    const profileData = {
      skin_type: parsed.skin_type,
      hair_type: parsed.hair_type ?? null,
      hair_concerns: parsed.hair_concerns,
      country: parsed.country,
      language: parsed.language,
      age_range: parsed.age_range,
    };

    const journeyData = {
      skin_concerns: parsed.skin_concerns,
      interest_activities: parsed.interest_activities,
      stay_days: parsed.stay_days,
      start_date: parsed.start_date,
      budget_level: parsed.budget_level,
      travel_style: parsed.travel_style,
    };

    // Service 순차 호출 (P-4, Q-13: profile → journey)
    try {
      await upsertProfile(client, user.id, profileData);
      const { journeyId } = await createOrUpdateJourney(
        client,
        user.id,
        journeyData,
      );

      return c.json(
        {
          data: { profile_id: user.id, journey_id: journeyId },
          meta: { timestamp: new Date().toISOString() },
        },
        201,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'PROFILE_CREATION_FAILED',
            message: 'Failed to save onboarding data',
            details: null,
          },
        },
        500,
      );
    }
  });

  // ── /api/profile ──────────────────────────────────────────
  app.use('/api/profile', requireAuth());
  app.use('/api/profile', rateLimit('profile_read', 60, 60_000));

  app.openapi(getProfileRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;

    try {
      // P-4: 두 도메인 순차 조회
      const profile = await getProfile(client, user.id);

      if (!profile) {
        return c.json(
          {
            error: {
              code: 'PROFILE_NOT_FOUND',
              message: 'Profile does not exist',
              details: null,
            },
          },
          404,
        );
      }

      const activeJourney = await getActiveJourney(client, user.id);

      return c.json(
        {
          data: { profile, active_journey: activeJourney },
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'PROFILE_RETRIEVAL_FAILED',
            message: 'Failed to retrieve profile',
            details: null,
          },
        },
        500,
      );
    }
  });

  app.use('/api/profile', rateLimit('profile_update', 60, 60_000));

  app.openapi(putProfileRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const body = c.req.valid('json');

    try {
      await updateProfile(client, user.id, body);
      return c.json(
        {
          data: { updated: true as const },
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'PROFILE_UPDATE_FAILED',
            message: 'Failed to update profile',
            details: null,
          },
        },
        500,
      );
    }
  });
}
