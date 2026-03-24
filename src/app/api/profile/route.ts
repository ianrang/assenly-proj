import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { getProfile, updateProfile } from '@/server/features/profile/service';
import { getActiveJourney } from '@/server/features/journey/service';

// ============================================================
// GET /api/profile — api-spec.md §2.3 + B.2 재방문 감지
// PUT /api/profile — api-spec.md §2.3 부분 업데이트
// L-1: thin route (인증 → 검증 → service 호출 → 응답).
// P-4: GET은 profile + journey 두 도메인 합성 (Composition Root).
// ============================================================

/** Q-1, Q-14: PUT 부분 업데이트 스키마 — DB 스키마와 일치 */
const updateSchema = z
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

/** 공통 인증 처리 — 실패 시 401 Response 반환 */
async function authenticate(req: Request) {
  try {
    return { user: await authenticateUser(req), error: null };
  } catch {
    return {
      user: null,
      error: Response.json(
        {
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication is required',
            details: null,
          },
        },
        { status: 401 },
      ),
    };
  }
}

/**
 * GET /api/profile — 본인 프로필 + 활성 여정 반환.
 * api-spec B.2: 200=재방문, 404=신규/미완료, 401=세션 만료.
 * P-4: route에서 두 도메인(profile, journey) 합성.
 */
export async function GET(req: Request) {
  const { user, error: authError } = await authenticate(req);
  if (!user) return authError!;

  const rateResult = checkRateLimit(
    user.id,
    'profile_read',
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

  const client = createAuthenticatedClient(user.token);

  try {
    // P-4: 두 도메인 순차 조회
    const profile = await getProfile(client, user.id);

    if (!profile) {
      return Response.json(
        {
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile does not exist',
            details: null,
          },
        },
        { status: 404, headers: rlHeaders },
      );
    }

    const activeJourney = await getActiveJourney(client, user.id);

    return Response.json(
      {
        data: { profile, active_journey: activeJourney },
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 200, headers: rlHeaders },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: 'PROFILE_RETRIEVAL_FAILED',
          message: 'Failed to retrieve profile',
          details: null,
        },
      },
      { status: 500, headers: rlHeaders },
    );
  }
}

/**
 * PUT /api/profile — 부분 업데이트 (변경 필드만 전송).
 * Q-14: language는 DB NOT NULL이므로 null 불가.
 */
export async function PUT(req: Request) {
  const { user, error: authError } = await authenticate(req);
  if (!user) return authError!;

  const rateResult = checkRateLimit(
    user.id,
    'profile_update',
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

  const parsed = updateSchema.safeParse(body);
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

  const client = createAuthenticatedClient(user.token);

  try {
    await updateProfile(client, user.id, parsed.data);

    return Response.json(
      {
        data: { updated: true },
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 200, headers: rlHeaders },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: 'PROFILE_UPDATE_FAILED',
          message: 'Failed to update profile',
          details: null,
        },
      },
      { status: 500, headers: rlHeaders },
    );
  }
}
