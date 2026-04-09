import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema, paginationMetaSchema } from '../schemas/common';
import { findAllClinics, findClinicById } from '@/server/features/repositories/clinic-repository';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

// ============================================================
// GET /api/clinics      — api-spec.md §2.2
// GET /api/clinics/:id  — api-spec.md §2.2
// L-1: thin route. findAllClinics / findClinicById 재사용.
// api-spec: 'query' param → repository 'search' 필드로 매핑.
// api-spec §2.2 line 228: embedding 필드 제외.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Q-1: 쿼리 파라미터 스키마 — api-spec.md §2.2 GET /api/clinics */
const listQuerySchema = z.object({
  district: z.string().optional(),
  english_support: z.string().optional(),
  clinic_type: z.string().optional(),
  query: z.string().optional(),  // api-spec §2.2: 'query' → repository 'search'로 매핑
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const listResponseSchema = z.object({
  data: z.array(z.any()),
  meta: paginationMetaSchema,
});

const detailResponseSchema = z.object({
  data: z.any(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const getClinicsRoute = createRoute({
  method: 'get',
  path: '/api/clinics',
  summary: 'List clinics',
  request: { query: listQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponseSchema } },
      description: 'Clinics retrieved',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Validation failed',
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

const getClinicByIdRoute = createRoute({
  method: 'get',
  path: '/api/clinics/:id',
  summary: 'Get clinic by ID',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: detailResponseSchema } },
      description: 'Clinic retrieved',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Invalid id',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Clinic not found',
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

export function registerClinicRoutes(app: AppType) {
  app.use('/api/clinics', optionalAuth());
  app.use('/api/clinics', rateLimit('public', 60, 60_000));
  app.use('/api/clinics/:id', optionalAuth());
  app.use('/api/clinics/:id', rateLimit('public', 60, 60_000));

  app.openapi(getClinicsRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const query = c.req.valid('query');

    const { district, english_support, clinic_type, query: searchQuery } = query;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    try {
      const { data: rawData, total } = await findAllClinics(
        client,
        {
          district,
          english_support,
          clinic_type,
          search: searchQuery,  // api-spec 'query' → repository 'search'
          status: 'active',
        },
        { page, pageSize: limit },
        { field: 'created_at', order: 'desc' },
      );

      // embedding 제외 (api-spec §2.2 line 228)
      const data = rawData.map(({ embedding: _, ...rest }: Record<string, unknown>) => rest);
      return c.json({ data, meta: { total, limit, offset } }, 200);
    } catch (error) {
      console.error('[GET /api/clinics] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinics', details: null } },
        500,
      );
    }
  });

  app.openapi(getClinicByIdRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const { id } = c.req.valid('param');

    try {
      const entity = await findClinicById(client, id);
      if (!entity) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: 'Clinic not found', details: null } },
          404,
        );
      }

      // embedding 제외
      const { embedding: _, ...rest } = entity as Record<string, unknown>;
      return c.json({ data: rest }, 200);
    } catch (error) {
      console.error('[GET /api/clinics/:id] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinic', details: null } },
        500,
      );
    }
  });
}
