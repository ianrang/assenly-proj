import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import {
  getProfile,
  updateProfile,
  upsertProfile,
  createMinimalProfile,
  markOnboardingCompleted,
  applyUserExplicitEdit,
} from '@/server/features/profile/service';
import { getActiveJourney, createOrUpdateJourney } from '@/server/features/journey/service';
import { createAuthenticatedClient } from '@/server/core/db';
import { MAX_SKIN_TYPES } from "@/shared/constants/profile-field-spec";
import { profileEditSchema } from '@/shared/validation/profile-edit';

// ============================================================
// POST /api/profile/onboarding — api-spec.md §2.3
// GET  /api/profile — api-spec.md §2.3 + B.2 재방문 감지
// PUT  /api/profile — api-spec.md §2.3 부분 업데이트
// P-4: Composition Root — profile + journey 합성.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

// ── Onboarding ────────────────────────────────────────────────

/**
 * Q-1, Q-14: zod 입력 검증 — DB 스키마 열거값과 일치.
 *
 * NEW-9b: 두 경로 discriminated union.
 *  - Start 경로: skin_type 필수, skin_concerns 최대 3개 (PRD §595 정본).
 *                나머지 full-wizard(v0.2 경로A) 필드는 optional 하위 호환.
 *  - Skip 경로: { skipped: true } 만 전송. user_profiles 레코드만 생성 + 완료 게이트.
 */
const skinTypeEnum = z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']);
const skinConcernEnum = z.enum([
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
]);
const hairTypeEnum = z.enum(['straight', 'wavy', 'curly', 'coily']);
const hairConcernEnum = z.enum([
  'damage',
  'thinning',
  'oily_scalp',
  'dryness',
  'dandruff',
  'color_treated',
]);
const languageEnum = z.enum(['en', 'ja', 'zh', 'es', 'fr', 'ko']);
const ageRangeEnum = z.enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+']);
const budgetLevelEnum = z.enum(['budget', 'moderate', 'premium', 'luxury']);
const interestActivityEnum = z.enum(['shopping', 'clinic', 'salon', 'dining', 'cultural']);
const travelStyleEnum = z.enum([
  'efficient',
  'relaxed',
  'adventurous',
  'instagram',
  'local_experience',
  'luxury',
  'budget',
]);

// NEW-9b adversarial review C1 정합:
// 두 스키마 모두 .strict()로 경계 분리. { skipped:true, skin_type:'x' }처럼
// 모순된 payload가 조용히 Skip 경로로 떨어져 데이터 손실되는 문제 차단.
// Start 경로는 'skipped' 필드 선언 자체를 제외 — 포함되면 strict로 400.
const startOnboardingBodySchema = z
  .object({
    // user_profiles 필드 (UP 변수)
    skin_types: z.array(skinTypeEnum).min(1).max(MAX_SKIN_TYPES),
    hair_type: hairTypeEnum.nullable().optional(),
    hair_concerns: z.array(hairConcernEnum).default([]),
    country: z.string().min(2).max(2).optional(),
    language: languageEnum.default('en'),
    age_range: ageRangeEnum.optional(),

    // journeys 필드 (JC 변수)
    // NEW-9b: PRD §595 정본 — 온보딩 UI 7종 중 최대 3개. 저장 한계 5(대화 추출 포함).
    skin_concerns: z.array(skinConcernEnum).max(5).default([]),
    interest_activities: z.array(interestActivityEnum).default(['shopping']),
    stay_days: z.number().int().positive().optional(),
    start_date: z.string().date().optional(),
    budget_level: budgetLevelEnum.optional(),
    travel_style: z.array(travelStyleEnum).default([]),
  })
  .strict();

const skipOnboardingBodySchema = z
  .object({
    skipped: z.literal(true),
    language: languageEnum.default('en'),
  })
  .strict();

const onboardingBodySchema = z.union([
  skipOnboardingBodySchema,
  startOnboardingBodySchema,
]);

const onboardingResponseSchema = z.object({
  data: z.object({
    profile_id: z.string(),
    journey_id: z.string().nullable(),
    onboarding_completed: z.literal(true),
  }),
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
    skin_types: z
      .array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']))
      .min(1)
      .max(MAX_SKIN_TYPES)
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

const putProfileEditRoute = createRoute({
  method: 'put',
  path: '/api/profile/edit',
  summary: 'NEW-17d: user-explicit profile + journey edit (atomic REPLACE)',
  request: {
    body: {
      content: { 'application/json': { schema: profileEditSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              applied_profile: z.array(z.string()),
              applied_journey: z.array(z.string()),
            }),
            meta: z.object({ timestamp: z.string() }),
          }),
        },
      },
      description: 'Edit applied',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Validation failed' },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Authentication required' },
    404: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Profile not found' },
    429: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Rate limit exceeded' },
    500: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Edit failed' },
  },
});

// ============================================================
// 온보딩 저장 오케스트레이션 (NEW-9b)
//
// 3단계 invariant — 순서를 변경하지 말 것:
//   1. upsertProfile              ← user_profiles (UP 변수)
//   2. createOrUpdateJourney      ← journeys (JC 변수, Start 경로에서만)
//   3. markOnboardingCompleted    ← 원샷 게이트 (WHERE IS NULL, 불변량 I4)
//
// 부분 실패 시 자기 치유 (I7):
//   - 1단계 실패 → profile 미저장 → 재전송 시 정상 재시도
//   - 2단계 실패 → profile 저장/게이트 미설정 → 재전송 시 upsert+journey 멱등, 게이트 설정
//   - 3단계 실패 → profile+journey 저장/게이트 미설정 → 재전송 시 멱등, 게이트 설정
//
// 순서를 역전시키면 게이트가 먼저 설정되어 중간 실패 시 칩이 재표시되지 않아
// 자기 치유가 깨진다. L-1 thin handler 준수를 위해 private helper로 분리.
// ============================================================
type OnboardingBody = z.infer<typeof onboardingBodySchema>;
type SkipOnboardingBody = z.infer<typeof skipOnboardingBodySchema>;
type StartOnboardingBody = z.infer<typeof startOnboardingBodySchema>;

function isSkipOnboardingBody(body: OnboardingBody): body is SkipOnboardingBody {
  return 'skipped' in body && body.skipped === true;
}

async function persistOnboarding(
  client: DbClient,
  userId: string,
  body: OnboardingBody,
): Promise<string | null> {
  // Skip 경로: user_profiles 레코드 확보(language만) + 게이트 설정.
  //
  // 데이터 보존(NEW-9b 리뷰 개선):
  //   upsertProfile로 전체 덮어쓰면 기존 extract_user_profile 결과가 손실된다.
  //   create-if-missing 패턴 사용 — chat.ts:356-370의 afterWork 패턴과 동일:
  //     1. createMinimalProfile(language만 set, 나머지 DB default null)
  //     2. PK 충돌(=이미 존재) → updateProfile({ language })로 language만 갱신,
  //        기존 skin_type / hair_type / 등 보존
  // 타입 가드: z.union의 두 브랜치를 'skipped' 키 유무로 구분 (C1 정합 보강).
  if (isSkipOnboardingBody(body)) {
    try {
      await createMinimalProfile(client, userId, body.language);
    } catch {
      await updateProfile(client, userId, { language: body.language });
    }
    await markOnboardingCompleted(client, userId);
    return null;
  }

  // Start 경로: profile + journey + 게이트
  const startBody: StartOnboardingBody = body;
  await upsertProfile(client, userId, {
    skin_types: startBody.skin_types,
    hair_type: startBody.hair_type ?? null,
    hair_concerns: startBody.hair_concerns,
    country: startBody.country ?? null,
    language: startBody.language,
    age_range: startBody.age_range ?? null,
  });

  const { journeyId } = await createOrUpdateJourney(client, userId, {
    skin_concerns: startBody.skin_concerns,
    interest_activities: startBody.interest_activities,
    stay_days: startBody.stay_days ?? null,
    start_date: startBody.start_date ?? null,
    budget_level: startBody.budget_level ?? null,
    travel_style: startBody.travel_style,
  });

  await markOnboardingCompleted(client, userId);
  return journeyId;
}

export function registerProfileRoutes(app: AppType) {
  // ── /api/profile/onboarding ───────────────────────────────
  app.use('/api/profile/onboarding', requireAuth());
  app.use('/api/profile/onboarding', rateLimit('profile_onboarding', 60, 60_000));

  app.openapi(postOnboardingRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const parsed = c.req.valid('json');

    try {
      const journeyId = await persistOnboarding(client, user.id, parsed);
      return c.json(
        {
          data: {
            profile_id: user.id,
            journey_id: journeyId,
            onboarding_completed: true as const,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        201,
      );
    } catch (error) {
      console.error('[profile/onboarding] failed', String(error));
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
    } catch (error) {
      console.error('[GET /api/profile] failed', String(error));
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
    } catch (error) {
      console.error('[PUT /api/profile] failed', String(error));
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

  // ── /api/profile/edit (NEW-17d) ───────────────────────────
  app.use('/api/profile/edit', requireAuth());
  app.use('/api/profile/edit', rateLimit('profile_edit', 30, 60_000));

  app.openapi(putProfileEditRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const body = c.req.valid('json');

    try {
      const result = await applyUserExplicitEdit(
        client,
        user.id,
        body.profile,
        body.journey,
      );
      return c.json(
        {
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'PROFILE_NOT_FOUND') {
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
      console.error('[PUT /api/profile/edit] failed', String(error));
      return c.json(
        {
          error: {
            code: 'PROFILE_EDIT_FAILED',
            message: 'Failed to save profile edits',
            details: null,
          },
        },
        500,
      );
    }
  });
}
