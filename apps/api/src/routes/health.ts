import { Hono } from 'hono';
import { env } from '../env.js';
import type { AppBindings } from '../types/context.js';

const startedAt = Date.now();

/**
 * Liveness endpoint. Deliberately unauthenticated and dependency-free so it
 * answers even when the database is unreachable - a health check that fails
 * when Postgres is down cannot tell you that Postgres is down.
 *
 * apps/web calls this on its home page, which is what proves the typed contract
 * between the two apps in phase 0.
 */
export const healthRoute = new Hono<AppBindings>().get('/health', (c) =>
  c.json({
    ok: true,
    service: 'nexora-api',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  }),
);
