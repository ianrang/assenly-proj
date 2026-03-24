import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { upsertProfile } from '@/server/features/profile/service';
import { createOrUpdateJourney } from '@/server/features/journey/service';

// ============================================================
// POST /api/profile/onboarding — api-spec.md §2.3
// L-1: thin route (인증 → 검증 → service 호출 → 응답).
// P-4: Composition Root — profile + journey service 순차 호출.
// Q-11: 복합 쓰기. ② 실패 시 에러 응답 (성공 응답 미반환).
// Q-13: FK 순서 — user_profiles(①) → journeys(②).
// ============================================================

/** Q-1, Q-14: zod 입력 검증 — DB 스키마 열거값과 일치 */
const onboardingSchema = z.object({
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

/** Rate limit 설정 — api-spec.md §4.1 */
const RATE_LIMIT_CONFIG = {
  limit: 60,
  windowMs: 60 * 1000,
  window: 'minute',
} as const;

/** api-spec.md §1.6: X-RateLimit-* 헤더 생성 */
function rateLimitHeaders(
  remaining: number,
  resetAt: number,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export async function POST(req: Request) {
  // 1. 인증 (auth-matrix.md §3.3: 필수)
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      {
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication is required',
          details: null,
        },
      },
      { status: 401 },
    );
  }

  // 2. Rate limit (user_id 기준)
  const rateResult = checkRateLimit(
    user.id,
    'profile_onboarding',
    RATE_LIMIT_CONFIG,
  );
  const rlHeaders = rateLimitHeaders(rateResult.remaining, rateResult.resetAt);

  if (!rateResult.allowed) {
    const retryAfter = Math.ceil(
      (rateResult.resetAt - Date.now()) / 1000,
    );
    return Response.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
          details: { retryAfter },
        },
      },
      {
        status: 429,
        headers: { ...rlHeaders, 'Retry-After': String(retryAfter) },
      },
    );
  }

  // 3. 입력 검증 (Q-1)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid JSON body',
          details: null,
        },
      },
      { status: 400, headers: rlHeaders },
    );
  }

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          details: null,
        },
      },
      { status: 400, headers: rlHeaders },
    );
  }

  // 4. DB 클라이언트 생성 (RLS 적용)
  const client = createAuthenticatedClient(user.token);

  // 5. 필드 분리 (L-1: route 책임)
  const profileData = {
    skin_type: parsed.data.skin_type,
    hair_type: parsed.data.hair_type ?? null,
    hair_concerns: parsed.data.hair_concerns,
    country: parsed.data.country,
    language: parsed.data.language,
    age_range: parsed.data.age_range,
  };

  const journeyData = {
    skin_concerns: parsed.data.skin_concerns,
    interest_activities: parsed.data.interest_activities,
    stay_days: parsed.data.stay_days,
    start_date: parsed.data.start_date,
    budget_level: parsed.data.budget_level,
    travel_style: parsed.data.travel_style,
  };

  // 6. Service 순차 호출 (P-4, Q-13: profile → journey)
  try {
    await upsertProfile(client, user.id, profileData);
    const { journeyId } = await createOrUpdateJourney(
      client,
      user.id,
      journeyData,
    );

    // 7. 201 응답 — api-spec.md §1.1
    return Response.json(
      {
        data: { profile_id: user.id, journey_id: journeyId },
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201, headers: rlHeaders },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: 'PROFILE_CREATION_FAILED',
          message: 'Failed to save onboarding data',
          details: null,
        },
      },
      { status: 500, headers: rlHeaders },
    );
  }
}
