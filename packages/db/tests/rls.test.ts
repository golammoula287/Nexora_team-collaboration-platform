import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';
import { newId } from '../src/ids.js';
import { seedTwoOrgs, type TwoOrgs } from './helpers/fixtures.js';

/**
 * Row-level security - the second line of defence.
 *
 * `withOrg()` is the guard that matters; these policies exist for the day
 * someone bypasses it. A policy that was never executed is not defence, so
 * this file proves the policies are real by running as a role they apply to.
 *
 * A table's owner bypasses RLS, which is why these tests SET ROLE to a
 * non-owner. Production must do the same: the API connects as `nexora_app`,
 * not as the migration user. Until it does, these policies are inert - that is
 * the parking-lot item, and this test is what will confirm the fix.
 */

let harness: TestDatabase;
let orgs: TwoOrgs;

const APP_ROLE = 'nexora_app';

beforeAll(async () => {
  harness = await createTestDatabase();
  orgs = await seedTwoOrgs(harness.db);

  await harness.client.exec(`
    CREATE ROLE ${APP_ROLE} NOLOGIN;
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
  `);
});

afterAll(async () => {
  await harness?.close();
});

/**
 * Run a statement as the application role with `app.org_id` set, exactly as
 * `withOrg().transaction()` does at runtime.
 *
 * PGlite holds one connection, so a statement rejected by a policy leaves the
 * transaction aborted and every later query fails with 25P02. Rolling back on
 * failure keeps one test's expected rejection from cascading into the rest.
 */
async function asOrg(organizationId: string | null, statement: string) {
  // Omitted rather than set empty: `current_setting(..., true)` returns NULL
  // when never set, which is the condition being tested. Setting it to '' would
  // instead fail on the ::uuid cast and prove something else.
  const setOrg =
    organizationId === null ? '' : `select set_config('app.org_id', '${organizationId}', true);`;

  try {
    const result = await harness.client.exec(`
      BEGIN;
      SET LOCAL ROLE ${APP_ROLE};
      ${setOrg}
      ${statement}
      COMMIT;
    `);
    // One result per statement; the one we want is just before COMMIT.
    return result[result.length - 2];
  } catch (error) {
    await harness.client.exec('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

describe('row-level security', () => {
  it('is enabled on every tenant table', async () => {
    const result = await harness.db.execute<{ relname: string }>(sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and exists (
          select 1 from information_schema.columns col
          where col.table_schema = 'public'
            and col.table_name = c.relname
            and col.column_name = 'organization_id'
            and col.is_nullable = 'NO'
        )
        and c.relrowsecurity = false
      order by 1
    `);

    expect(result.rows.map((r) => r.relname)).toEqual([]);
  });

  it('shows a tenant only its own rows', async () => {
    const result = await asOrg(orgs.orgA.id, `SELECT id, organization_id FROM tasks;`);
    const rows = (result?.rows ?? []) as { organization_id: string }[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_id === orgs.orgA.id)).toBe(true);
  });

  it('returns zero rows for another tenant even on an explicit id', async () => {
    const result = await asOrg(
      orgs.orgA.id,
      `SELECT id FROM tasks WHERE id = '${orgs.orgB.taskId}';`,
    );

    expect(result?.rows ?? []).toEqual([]);
  });

  it('denies everything when app.org_id is unset, rather than allowing everything', async () => {
    // The important failure direction. `current_setting(..., true)` returns
    // NULL when unset, and `organization_id = NULL` is never true - so a
    // forgotten scope fails closed.
    const result = await asOrg(null, `SELECT id FROM tasks;`);

    expect(result?.rows ?? []).toEqual([]);
  });

  it('blocks writing a row into another tenant', async () => {
    await expect(
      asOrg(
        orgs.orgA.id,
        `INSERT INTO spaces (id, organization_id, name, slug, position)
         VALUES (gen_random_uuid(), '${orgs.orgB.id}', 'planted', 'planted', 'a0');`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('search indexes', () => {
  it('creates the HNSW index over the halfvec column', async () => {
    const result = await harness.db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes
      where schemaname = 'public' and indexname = 'embeddings_hnsw_idx'
    `);

    expect(result.rows[0]?.indexdef).toMatch(/hnsw/i);
    expect(result.rows[0]?.indexdef).toMatch(/halfvec_cosine_ops/i);
  });

  it('creates the GIN index over the generated tsvector', async () => {
    const result = await harness.db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes
      where schemaname = 'public' and indexname = 'embeddings_search_vector_idx'
    `);

    expect(result.rows[0]?.indexdef).toMatch(/gin/i);
  });

  it('maintains search_vector from content without application code', async () => {
    const orgId = orgs.orgA.id;
    // ids are generated by the application (uuid v7), not by a column default,
    // so a raw SQL insert has to supply one. That is deliberate: a
    // `gen_random_uuid()` default would silently mint v4 ids and break ordering.
    await harness.db.execute(sql`
      insert into embeddings (id, organization_id, entity_type, entity_id, content, model)
      values (${newId()}, ${orgId}, 'task', ${newId()}, 'quarterly revenue forecast', 'voyage-3.5')
    `);

    const result = await harness.db.execute<{ hit: boolean }>(sql`
      select search_vector @@ to_tsquery('english', 'forecast') as hit
      from embeddings
      where content = 'quarterly revenue forecast'
    `);

    expect(result.rows[0]?.hit).toBe(true);
  });

  it('accepts a 1024-dimension halfvec and rejects a wrong-width one', async () => {
    const orgId = orgs.orgA.id;
    const vector = `[${Array.from({ length: 1024 }, () => 0.1).join(',')}]`;

    await harness.db.execute(sql`
      insert into embeddings (id, organization_id, entity_type, entity_id, content, model, embedding)
      values (${newId()}, ${orgId}, 'task', ${newId()}, 'vector probe', 'voyage-3.5', ${vector}::halfvec)
    `);

    await expect(
      harness.db.execute(sql`
        insert into embeddings (id, organization_id, entity_type, entity_id, content, model, embedding)
        values (${newId()}, ${orgId}, 'task', ${newId()}, 'bad width', 'voyage-3.5', '[0.1,0.2]'::halfvec)
      `),
    ).rejects.toThrow();
  });
});
