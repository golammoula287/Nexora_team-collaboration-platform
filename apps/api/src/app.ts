import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { corsOrigins, isDevelopment, isProduction } from './env.js';
import { onError, onNotFound } from './middleware/error.js';
import { requestId } from './middleware/request-id.js';
import { authRoute } from './routes/auth.js';
import { devRoute } from './routes/dev.js';
import { healthRoute } from './routes/health.js';
import { meRoute } from './routes/me.js';
import { memberRoute } from './routes/members.js';
import { organizationRoute } from './routes/organizations.js';
import { projectRoute } from './routes/projects.js';
import type { Services } from './services.js';
import type { AppBindings } from './types/context.js';

/**
 * The Hono application, built from its dependencies rather than importing them.
 *
 * Routes are chained with `.route()` because that chain is what produces the
 * type `apps/web` consumes. Per-route auth (session -> org -> authorize) is
 * attached inside each route file so a route's guarantees are readable where
 * the route is defined.
 *
 * Order matters: auth and webhooks mount before anything that requires a
 * session, since sign-in cannot itself require being signed in.
 */
export function createApp(services: Services) {
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

  base.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });

  base.onError(onError);
  base.notFound(onNotFound);

  // Test-only helpers, and only outside production - see routes/dev.ts.
  if (!isProduction) base.route('/', devRoute());

  return base
    .route('/', healthRoute)
    .route('/', authRoute(services))
    .route('/', meRoute(services))
    .route('/', organizationRoute(services))
    .route('/', memberRoute(services))
    .route('/', projectRoute(services));
}

export type App = ReturnType<typeof createApp>;
