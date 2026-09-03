import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

/**
 * A real Postgres, in-process.
 *
 * PGlite is Postgres compiled to WASM, so this is not a mock or an in-memory
 * imitation: it runs the actual migrations, enforces the actual constraints,
 * and supports pgvector (halfvec + HNSW), pg_trgm, generated tsvector columns
 * and row-level security. That means the tenancy gate can be proven here
 * rather than deferred until a Neon branch exists.
 *
 * Only for tests and local tooling. Production goes through `createDatabase`.
 */
export async function createTestDatabase() {
  const client = await PGlite.create({ extensions: { vector, pg_trgm } });
  const db = drizzle({ client, schema, casing: 'snake_case' });

  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });

  return {
    db,
    client,
    async close() {
      await client.close();
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
