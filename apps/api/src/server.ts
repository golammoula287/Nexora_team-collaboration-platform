import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';
import { canServeAuth, createServices } from './lib/services.js';

if (!canServeAuth()) {
  // Better a refusal at boot than a server that answers /health and 500s on
  // every real request.
  console.error(
    '[api] DATABASE_URL and BETTER_AUTH_SECRET are required.\n' +
      '[api] Fill apps/api/.env - see .env.example.',
  );
  process.exit(1);
}

const app = createApp(createServices());

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
