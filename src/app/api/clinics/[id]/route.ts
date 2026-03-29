import 'server-only';
import { z } from 'zod';
import { optionalAuthenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { findClinicById } from '@/server/features/repositories/clinic-repository';

// ============================================================
// GET /api/clinics/:id — api-spec.md §2.2
// L-1: thin route. findClinicById 재사용 (단순 select).
// ============================================================

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // 3. id 검증
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid clinic id', details: null } },
      { status: 400 },
    );
  }

  // 4. client 생성
  const client = user ? createAuthenticatedClient(user.token) : createServiceClient();

  // 5. 단일 조회 (G-2: findClinicById 재사용)
  try {
    const entity = await findClinicById(client, id);
    if (!entity) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Clinic not found', details: null } },
        { status: 404 },
      );
    }

    // 6. embedding 제외
    const { embedding: _embedding, ...rest } = entity as Record<string, unknown>;
    return Response.json({ data: rest }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/clinics/:id] repository error', String(error));
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinic', details: null } },
      { status: 500 },
    );
  }
}
