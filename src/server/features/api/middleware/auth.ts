import 'server-only';
import { createMiddleware } from 'hono/factory';
import { authenticateUser, optionalAuthenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';

export const requireAuth = () =>
  createMiddleware(async (c, next) => {
    try {
      const user = await authenticateUser(c.req.raw);
      c.set('user', user);
      c.set('client', createAuthenticatedClient(user.token));
    } catch {
      return c.json(
        { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
        401,
      );
    }
    await next();
  });

export const optionalAuth = () =>
  createMiddleware(async (c, next) => {
    const user = await optionalAuthenticateUser(c.req.raw);
    c.set('user', user);
    c.set('client', user ? createAuthenticatedClient(user.token) : createServiceClient());
    await next();
  });
