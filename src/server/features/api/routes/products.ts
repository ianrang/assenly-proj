import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema, paginationMetaSchema } from '../schemas/common';
import { findAllProducts, findProductById } from '@/server/features/repositories/product-repository';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

// ============================================================
// GET /api/products      — api-spec.md §2.2
// GET /api/products/:id  — api-spec.md §2.2
// L-1: thin route. findAllProducts / findProductById 재사용.
// api-spec §2.2 line 228: embedding 필드 제외.
// ============================================================

type DbClient = ReturnType<typeof createAuthenticatedClient>;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Q-1: 쿼리 파라미터 스키마 — api-spec.md §2.2 GET /api/products */
const listQuerySchema = z.object({
  skin_types: z.string().optional(),
  concerns: z.string().optional(),
  category: z.string().optional(),
  budget_max: z.coerce.number().nonnegative().optional(),
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

const getProductsRoute = createRoute({
  method: 'get',
  path: '/api/products',
  summary: 'List products',
  request: { query: listQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponseSchema } },
      description: 'Products retrieved',
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

const getProductByIdRoute = createRoute({
  method: 'get',
  path: '/api/products/:id',
  summary: 'Get product by ID',
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: detailResponseSchema } },
      description: 'Product retrieved',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Invalid id',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Product not found',
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

export function registerProductRoutes(app: AppType) {
  app.use('/api/products', optionalAuth());
  app.use('/api/products', rateLimit('public', 60, 60_000));
  app.use('/api/products/:id', optionalAuth());
  app.use('/api/products/:id', rateLimit('public', 60, 60_000));

  app.openapi(getProductsRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const query = c.req.valid('query');

    const { skin_types, concerns, category, budget_max, search } = query;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    try {
      const { data: rawData, total } = await findAllProducts(
        client,
        {
          skin_types: skin_types ? skin_types.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          concerns: concerns ? concerns.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          category,
          budget_max,
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
      console.error('[GET /api/products] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve products', details: null } },
        500,
      );
    }
  });

  app.openapi(getProductByIdRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const { id } = c.req.valid('param');

    try {
      const entity = await findProductById(client, id);
      if (!entity) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: 'Product not found', details: null } },
          404,
        );
      }

      // embedding 제외
      const { embedding: _, ...rest } = entity as Record<string, unknown>;
      return c.json({ data: rest }, 200);
    } catch (error) {
      console.error('[GET /api/products/:id] repository error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve product', details: null } },
        500,
      );
    }
  });
}
