import 'server-only';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppType } from '../app';
import { optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { errorResponseSchema, paginationMetaSchema } from '../schemas/common';
import { getDomainHandler } from '@/server/features/explore/domain-handlers';
import { getProfile } from '@/server/features/profile/service';
import { calculatePreferredIngredients, calculateAvoidedIngredients, resolveConflicts } from '@/server/features/beauty/derived';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import type { ExploreDomain } from '@/shared/types/explore';
import type { SkinType } from '@/shared/types/domain';

type DbClient = ReturnType<typeof createAuthenticatedClient>;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const VALID_DOMAINS = ['products', 'treatments', 'stores', 'clinics'] as const;

const exploreQuerySchema = z.object({
  domain: z.enum(VALID_DOMAINS),
  skin_types: z.string().optional(),
  concerns: z.string().optional(),
  category: z.string().optional(),
  budget_max: z.coerce.number().nonnegative().optional(),
  max_downtime: z.coerce.number().nonnegative().optional(),
  store_type: z.string().optional(),
  clinic_type: z.string().optional(),
  english_support: z.string().optional(),
  sort: z.enum(['relevance', 'rating', 'price']).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const exploreResponseSchema = z.object({
  data: z.array(z.any()),
  meta: paginationMetaSchema.extend({
    domain: z.string(),
    scored: z.boolean(),
  }),
});

const getExploreRoute = createRoute({
  method: 'get',
  path: '/api/explore',
  summary: 'Explore domains with filters, scoring, and pagination',
  request: { query: exploreQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: exploreResponseSchema } },
      description: 'Explore results retrieved',
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

function parseCommaSeparated(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function registerExploreRoutes(app: AppType) {
  app.use('/api/explore', optionalAuth());
  app.use('/api/explore', rateLimit('public', 60, 60_000));

  app.openapi(getExploreRoute, async (c) => {
    const user = c.get('user');
    const client = (user ? c.get('client') : createServiceClient()) as DbClient;
    const query = c.req.valid('query');

    const { domain } = query;
    const handler = getDomainHandler(domain as ExploreDomain);
    if (!handler) {
      return c.json(
        { error: { code: 'INVALID_DOMAIN', message: `Invalid domain: ${domain}`, details: null } },
        400,
      );
    }

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;
    const sort = query.sort ?? 'rating';

    const filters: Record<string, unknown> = {};
    if (query.skin_types) filters.skin_types = parseCommaSeparated(query.skin_types);
    if (query.concerns) filters.concerns = parseCommaSeparated(query.concerns);
    if (query.category) filters.category = parseCommaSeparated(query.category);
    if (query.budget_max) filters.budget_max = query.budget_max;
    if (query.max_downtime) filters.max_downtime = query.max_downtime;
    if (query.store_type) filters.store_type = query.store_type;
    if (query.clinic_type) filters.clinic_type = query.clinic_type;
    if (query.english_support) filters.english_support = query.english_support;

    const sortField = sort === 'relevance' ? 'rating' : sort === 'price' ? 'price' : 'rating';
    const sortOrder = sort === 'price' ? ('asc' as const) : ('desc' as const);

    try {
      const { data: rawData, total } = await handler.fetch(
        client,
        filters,
        { page, pageSize: limit },
        { field: sortField, order: sortOrder },
      );

      let scored = false;
      let resultData = rawData;

      if (sort === 'relevance' && user) {
        const profile = await getProfile(client, user.id);
        if (profile) {
          scored = true;
          const skinTypes = (profile.skin_types ?? []) as SkinType[];
          const preferred = calculatePreferredIngredients(skinTypes, [], []);
          const avoided = calculateAvoidedIngredients(skinTypes, []);
          const resolved = resolveConflicts(preferred, avoided);

          const ranked = handler.score(rawData, resolved.preferred, resolved.avoided);
          resultData = ranked.map((r: { item: { id: string; reasons: string[] } }) => {
            const original = (rawData as Record<string, unknown>[]).find((d) => d.id === r.item.id);
            return { ...original, reasons: r.item.reasons };
          });
        }
      }

      const data = (resultData as Record<string, unknown>[]).map((item) => {
        const { embedding: _, ...rest } = item;
        return rest;
      });

      return c.json({
        data,
        meta: { total, limit, offset, domain, scored },
      }, 200);
    } catch (error) {
      console.error('[GET /api/explore] error', String(error));
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve explore data', details: null } },
        500,
      );
    }
  });
}
