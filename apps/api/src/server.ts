import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './env.js';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.warn(`[api] listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  console.warn(`[api] cors origins: ${env.CORS_ORIGIN}`);
});

/** Let Node finish in-flight requests before exiting on a container stop. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.warn(`[api] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
