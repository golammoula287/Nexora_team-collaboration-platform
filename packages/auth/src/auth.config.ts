import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema } from '@nexora/db';
import { createAuth } from './auth.js';

/**
 * CONFIG FILE FOR `@better-auth/cli` ONLY. Not imported by the app.
 *
 * The CLI needs a module that exports a built `auth` instance so it can read
 * the plugin set and emit the schema those plugins require. It never runs a
 * query, so an empty in-memory Postgres is enough.
 *
 * Run `pnpm --filter @nexora/auth auth:generate` after changing the plugin
 * list, then diff the output against packages/db/src/schema/auth.ts.
 */
export const auth = createAuth({
  database: drizzle({ client: new PGlite(), schema, casing: 'snake_case' }),
  secret: 'cli-placeholder-secret-not-used-for-anything-real',
  baseURL: 'http://localhost:4000',
  trustedOrigins: ['http://localhost:3000'],
  sendEmail: async () => undefined,
});
