import { z } from 'zod';
import { checkRateLimit } from '@/server/core/rate-limit';
import { createAnonymousSession } from '@/server/features/auth/service';

// ============================================================
// POST /api/auth/anonymous — api-spec.md §2.1
// L-1: thin route (검증 -> service 호출 -> 응답).
// auth-matrix.md §2.4: 공개 엔드포인트 (인증 없음).
// api-spec.md §4.1: Rate limit 3회/분, IP 기준.
// ============================================================

/** Q-1: zod 입력 검증 스키마 */
const anonymousAuthSchema = z.object({
  consent: z.object({
    data_retention: z.literal(true, {
      message: 'data_retention consent is required',
    }),
  }),
});

/** Rate limit 설정 — api-spec.md §4.1 */
const RATE_LIMIT_CONFIG = {
  limit: 3,
  windowMs: 60 * 1000,
  window: 'minute',
} as const;

/** IP 추출: x-forwarded-for(첫 IP) -> x-real-ip -> 폴백 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

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
  // 1. Rate limit (IP 기준)
  const ip = getClientIp(req);
  const rateResult = checkRateLimit(ip, 'anon_create', RATE_LIMIT_CONFIG);
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

  // 2. 입력 검증 (zod)
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

  const parsed = anonymousAuthSchema.safeParse(body);
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

  // 3. Service 호출
  try {
    // zod 검증 통과 = data_retention은 반드시 true
    const result = await createAnonymousSession({ data_retention: true });

    // 4. 201 응답 — api-spec.md §1.1
    return Response.json(
      {
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201, headers: rlHeaders },
    );
  } catch {
    // 내부 에러 메시지 노출 금지 — 제네릭 메시지만 반환
    return Response.json(
      {
        error: {
          code: 'AUTH_SESSION_CREATION_FAILED',
          message: 'Failed to create session',
          details: null,
        },
      },
      { status: 500, headers: rlHeaders },
    );
  }
}
