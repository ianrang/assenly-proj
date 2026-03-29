import 'server-only';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

export type AppType = OpenAPIHono<{
  Variables: {
    user: { id: string; token: string } | null;
    client: unknown;
  };
}>;

export function createApp(): AppType {
  const app = new OpenAPIHono<{
    Variables: {
      user: { id: string; token: string } | null;
      client: unknown;
    };
  }>();

  // Global error handler (I4: error-handler.ts 대체)
  app.onError((err, c) => {
    console.error('[api] unhandled error', String(err));
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: null } },
      500,
    );
  });

  // OpenAPI JSON endpoint
  app.doc('/api/docs/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Essenly K-Beauty API', version: '0.1.0', description: 'K-Beauty AI Agent API' },
  });

  // Swagger UI
  app.get('/api/docs', swaggerUI({ url: '/api/docs/openapi.json' }));

  return app;
}
