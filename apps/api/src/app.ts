import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { corsOrigins, isDevelopment } from './env.js';
import { onError, onNotFound } from './middleware/error.js';
import { requestId } from './middleware/request-id.js';
import { healthRoute } from './routes/health.js';
import type { AppBindings } from './types/context.js';

/**
 * The Hono application.
 *
 * Global middleware is registered first, then routes are chained on - the chain
 * is what produces the type `apps/web` consumes, so every route must be attached
 * with `.route()` on this value and not with a bare `base.route(...)` statement.
 *
 * Per-route auth (session -> org -> authorize) is attached inside each route file
 * so a route's guarantees are readable where the route is defined. Webhook routes
 * mount before any auth middleware and verify their own signature.
 */
const base = new Hono<AppBindings>();

base.use('*', requestId);
base.use('*', secureHeaders());
base.use(
  '*',
  cors({
    origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  }),
);

if (isDevelopment) {
  base.use('*', logger());
}

base.onError(onError);
base.notFound(onNotFound);

export const app = base.route('/', healthRoute);
