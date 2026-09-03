import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.js';

/**
 * Two Neon drivers, deliberately:
 *
 * - neon-http is a single round trip per statement. Cheapest for one-shot reads,
 *   but it cannot hold a transaction open.
 * - neon-serverless speaks the real wire protocol over a WebSocket, so it
 *   supports transactions - which every mutation needs, since a write and its
 *   `activities` row must land together.
 *
 * `createDatabase` returns the transactional one. That is the default because
 * being unable to open a transaction is a much worse failure mode than one
 * extra connection.
 */

export type Schema = typeof schema;

export function createDatabase(connectionString: string) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is empty - set it in apps/api/.env');
  }

  neonConfig.poolQueryViaFetch = true;
  const pool = new Pool({ connectionString });
  return drizzleServerless({ client: pool, schema, casing: 'snake_case' });
}

/** Read-only handle for hot paths that never open a transaction. */
export function createReadOnlyDatabase(connectionString: string) {
  return drizzleHttp({ client: neon(connectionString), schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * Driver-agnostic handles. `withOrg()` is typed against these rather than
 * against the Neon driver, so the same tenancy code runs unchanged against the
 * PGlite instance the tests use. If the guard only worked on one driver, the
 * tests would be proving something other than production behaviour.
 */
export type AnyDatabase = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = Parameters<Parameters<AnyDatabase['transaction']>[0]>[0];
