import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema, paginationMetaSchema } from '../schemas/common';
import { findAllTreatments, findTreatmentById } from '@/server/features/repositories/treatment-repository';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

// ============================================================
// GET /api/treatments      — api-spec.md §2.2
// GET /api/treatments/:id  — api-spec.md §2.2
// L-1: thin route. findAllTreatments / findTreatmentById 재사용.
// api-spec §2.2 line 228: embedding 필드 제외.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Q-1: 쿼리 파라미터 스키마 — api-spec.md §2.2 GET /api/treatments */
const listQuerySchema = z.object({
  skin_types: z.string().optional(),
  concerns: z.string().optional(),
  category: z.string().optional(),
  budget_max: z.coerce.number().nonnegative().optional(),
  max_downtime: z.coerce.number().nonnegative().optional(),
  search: z.string().optional(),
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

const getTreatmentsRoute = createRoute({
  method: 'get',
  path: '/api/treatments',
  summary: 'List treatments',
  request: { query: listQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponseSchema } },
      description: 'Treatments retrieved',
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

const getTreatmentByIdRoute = createRoute({
  method: 'get',
  path: '/api/treatments/:id',
  summary: 'Get treatment by ID',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: detailResponseSchema } },
      description: 'Treatment retrieved',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Invalid id',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Treatment not found',
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

export function registerTreatmentRoutes(app: AppType) {
  app.use('/api/treatments', optionalAuth());
  app.use('/api/treatments', rateLimit('public', 60, 60_000));
  app.use('/api/treatments/:id', optionalAuth());
  app.use('/api/treatments/:id', rateLimit('public', 60, 60_000));

  app.openapi(getTreatmentsRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const query = c.req.valid('query');

    const { skin_types, concerns, category, budget_max, max_downtime, search } = query;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    try {
      const { data: rawData, total } = await findAllTreatments(
        client,
        {
          skin_types: skin_types ? skin_types.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          concerns: concerns ? concerns.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          category,
          budget_max,
          max_downtime,
          search,
          status: 'active',
        },
        { page, pageSize: limit },
        { field: 'created_at', order: 'desc' },
      );

      // embedding 제외 (api-spec §2.2 line 228)
      const data = rawData.map(({ embedding: _, ...rest }: Record<string, unknown>) => rest);
      return c.json({ data, meta: { total, limit, offset } }, 200);
    } catch (error) {
      console.error('[GET /api/treatments] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve treatments', details: null } },
        500,
      );
    }
  });

  app.openapi(getTreatmentByIdRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const { id } = c.req.valid('param');

    try {
      const entity = await findTreatmentById(client, id);
      if (!entity) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: 'Treatment not found', details: null } },
          404,
        );
      }

      // embedding 제외 (Supabase join 타입 → unknown 경유 캐스트)
      const { embedding: _, ...rest } = (entity as unknown) as Record<string, unknown>;
      return c.json({ data: rest }, 200);
    } catch (error) {
      console.error('[GET /api/treatments/:id] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve treatment', details: null } },
        500,
      );
    }
  });
}
