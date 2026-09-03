import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * There is exactly one DATABASE_URL in this repo and it lives in the API's env
 * file (decision #20). drizzle-kit reads it from there rather than owning a
 * second copy that could drift.
 */
config({ path: '../../apps/api/.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  dbCredentials: {
    // Migrations run over the direct connection, not the pooler.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
