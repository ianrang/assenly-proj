import 'server-only';
import { createMiddleware } from 'hono/factory';
import { checkRateLimit } from '@/server/core/rate-limit';

/** IP 추출: x-forwarded-for(첫 IP) → x-real-ip → 폴백. 기존 auth/anonymous/route.ts 로직 보존. */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

export const rateLimit = (endpoint: string, limit: number, windowMs = 60000) =>
  createMiddleware(async (c, next) => {
    const user = c.get('user');
    const identifier = user?.id ?? getClientIp(c.req.raw);
    const result = checkRateLimit(identifier, endpoint, {
      limit,
      windowMs,
      window: windowMs >= 86400000 ? 'daily' : 'minute',
    });

    // X-RateLimit-* headers on ALL responses (api-spec §1.6)
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Try again in ${retryAfter}s.`,
            details: { retryAfter },
          },
        },
        429,
      );
    }
    await next();
  });
