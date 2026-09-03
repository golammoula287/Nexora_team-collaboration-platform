import { Hono } from 'hono';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Mounts Better Auth at /api/auth/*.
 *
 * It handles its own routing, so everything under the prefix is forwarded
 * verbatim. This mounts BEFORE the session middleware for the obvious reason:
 * sign-in cannot require a session.
 */
export function authRoute(services: Services) {
  return new Hono<AppBindings>().on(['GET', 'POST'], '/api/auth/*', (c) =>
    services.auth.handler(c.req.raw),
  );
}
