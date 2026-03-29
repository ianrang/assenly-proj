import 'server-only';
import { z } from 'zod';
import { optionalAuthenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { findAllClinics } from '@/server/features/repositories/clinic-repository';

// ============================================================
// GET /api/clinics — api-spec.md §2.2
// L-1: thin route (인증 → 검증 → repository → 응답).
// G-2: findAllClinics 재사용 (offset→page 변환).
// api-spec: 'query' param → repository 'search' 필드로 매핑.
// ============================================================

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

/** Q-1: 쿼리 파라미터 스키마 — api-spec.md §2.2 GET /api/clinics */
const querySchema = z.object({
  district: z.string().optional(),
  english_support: z.string().optional(),
  clinic_type: z.string().optional(),
  query: z.string().optional(),  // api-spec §2.2: 'query' → repository 'search'로 매핑
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export async function GET(req: Request) {
  // 1. 인증 (선택)
  const user = await optionalAuthenticateUser(req);

  // 2. Rate limit
  const identifier = user?.id ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateResult = checkRateLimit(identifier, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 3. 쿼리 파라미터 검증
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  const { district, english_support, clinic_type, query } = parsed.data;
  const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parsed.data.offset ?? 0;
  const page = Math.floor(offset / limit) + 1;

  // 4. client 생성
  const client = user ? createAuthenticatedClient(user.token) : createServiceClient();

  // 5. 목록 조회 (G-2: findAllClinics 재사용, query→search 매핑)
  try {
    const { data: rawData, total } = await findAllClinics(
      client,
      {
        district,
        english_support,
        clinic_type,
        search: query,  // api-spec 'query' → repository 'search'
        status: 'active',
      },
      { page, pageSize: limit },
      { field: 'created_at', order: 'desc' },
    );

    // 6. embedding 제외 (api-spec §2.2 line 228)
    const data = rawData.map(({ embedding: _embedding, ...rest }: Record<string, unknown>) => rest);
    return Response.json({ data, meta: { total, limit, offset } }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/clinics] repository error', String(error));
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinics', details: null } },
      { status: 500 },
    );
  }
}
