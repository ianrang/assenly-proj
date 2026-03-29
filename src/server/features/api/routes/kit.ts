import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema } from '../schemas/common';
import { encrypt, hash } from '@/server/core/crypto';
import { createAuthenticatedClient } from '@/server/core/db';

// ============================================================
// POST /api/kit/claim — api-spec.md §2.5
// schema.dbml kit_subscribers: email_encrypted + email_hash.
// data-privacy.md §1.2: consent_records.marketing UPDATE.
// Q-12: email_hash UNIQUE → 멱등성 (중복 제출 시 409).
// Q-15: consent UPDATE는 부수 효과 — 실패해도 kit 등록 유효.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

const kitClaimBodySchema = z.object({
  email: z.string().email().max(320),
  marketing_consent: z.boolean(),
});

const kitClaimResponseSchema = z.object({
  data: z.object({ status: z.literal('claimed') }),
});

const postKitClaimRoute = createRoute({
  method: 'post',
  path: '/api/kit/claim',
  summary: 'Claim beauty kit (email registration)',
  request: {
    body: {
      content: { 'application/json': { schema: kitClaimBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: kitClaimResponseSchema } },
      description: 'Kit claimed',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Validation failed',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Authentication required',
    },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Kit already claimed',
    },
    429: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Rate limit exceeded',
    },
    500: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Claim failed',
    },
  },
});

export function registerKitRoutes(app: AppType) {
  app.use('/api/kit/claim', requireAuth());
  app.use('/api/kit/claim', rateLimit('public', 60, 60_000));

  app.openapi(postKitClaimRoute, async (c) => {
    const user = c.get('user')!;
    const client = c.get('client') as DbClient;
    const parsed = c.req.valid('json');

    // 이메일 암호화 + 해시
    const emailEncrypted = encrypt(parsed.email);
    const emailHash = hash(parsed.email.toLowerCase().trim());

    try {
      // kit_subscribers INSERT (Q-12: email_hash UNIQUE → 중복 시 에러)
      const { error: insertError } = await client
        .from('kit_subscribers')
        .insert({
          user_id: user.id,
          email_encrypted: emailEncrypted,
          email_hash: emailHash,
          marketing_consent: parsed.marketing_consent,
        });

      if (insertError) {
        // UNIQUE 제약 위반 = 중복 제출
        if (insertError.code === '23505') {
          return c.json(
            {
              error: {
                code: 'KIT_ALREADY_CLAIMED',
                message: 'Kit already claimed with this email',
                details: null,
              },
            },
            409,
          );
        }
        throw insertError;
      }

      // consent_records.marketing UPDATE (data-privacy.md §1.2)
      // Q-15: consent UPDATE는 kit 등록의 부수 효과. 실패해도 kit 등록은 유효.
      if (parsed.marketing_consent) {
        const { error: consentError } = await client
          .from('consent_records')
          .update({ marketing: true, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);

        if (consentError) {
          console.error('[kit/claim] consent update failed', String(consentError));
          // Q-15: 실패 로그만. kit 등록 성공 응답은 유지.
        }
      }

      return c.json({ data: { status: 'claimed' as const } }, 201);
    } catch (error) {
      console.error('[kit/claim] failed', String(error));
      return c.json(
        {
          error: {
            code: 'KIT_CLAIM_FAILED',
            message: 'Failed to process kit claim',
            details: null,
          },
        },
        500,
      );
    }
  });
}
