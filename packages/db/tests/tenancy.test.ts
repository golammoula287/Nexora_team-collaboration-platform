import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';
import * as s from '../src/schema/index.js';
import { withOrg } from '../src/tenancy.js';
import { newId } from '../src/ids.js';
import { seedTwoOrgs, type TwoOrgs } from './helpers/fixtures.js';

/**
 * THE PHASE 1 EXIT GATE.
 *
 * "A query from org A returns zero rows of org B" - asserted against a real
 * Postgres running the real migrations, through the path production uses.
 */

let harness: TestDatabase;
let orgs: TwoOrgs;

beforeAll(async () => {
  harness = await createTestDatabase();
  orgs = await seedTwoOrgs(harness.db);
});

afterAll(async () => {
  await harness?.close();
});

describe('withOrg isolation', () => {
  it('returns zero rows of another org, on every domain table', async () => {
    const scope = withOrg(harness.db, orgs.orgA.id);

    for (const table of [s.tasks, s.projects, s.spaces] as const) {
      const rows = await harness.db.select().from(table).where(scope.where(table));

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.organizationId).toBe(orgs.orgA.id);
      }
      expect(rows.some((r) => r.organizationId === orgs.orgB.id)).toBe(false);
    }
  });

  it('cannot reach another org row even when its id is known', async () => {
    // The exact attack: a client passes a valid id belonging to someone else.
    const scope = withOrg(harness.db, orgs.orgA.id);

    const rows = await harness.db
      .select()
      .from(s.tasks)
      .where(scope.where(s.tasks, eq(s.tasks.id, orgs.orgB.taskId)));

    expect(rows).toEqual([]);
  });

  it('proves the guard is doing the work, not the data', async () => {
    // An unscoped query - what a forgotten withOrg() looks like - sees both.
    // If this ever returns one row, the test above has stopped proving anything.
    const all = await harness.db.select().from(s.tasks);
    const orgIds = new Set(all.map((t) => t.organizationId));

    expect(orgIds.has(orgs.orgA.id)).toBe(true);
    expect(orgIds.has(orgs.orgB.id)).toBe(true);
  });

  it('puts the org predicate in the SQL, not in JS after the fetch', async () => {
    const scope = withOrg(harness.db, orgs.orgA.id);
    const query = harness.db.select().from(s.tasks).where(scope.where(s.tasks)).toSQL();

    expect(query.sql).toContain('organization_id');
    expect(query.params).toContain(orgs.orgA.id);
  });

  it('excludes soft-deleted rows by default and includes them on request', async () => {
    const scope = withOrg(harness.db, orgs.orgA.id);

    await harness.db
      .update(s.tasks)
      .set({ deletedAt: new Date() })
      .where(eq(s.tasks.id, orgs.orgA.taskId));

    const visible = await harness.db.select().from(s.tasks).where(scope.where(s.tasks));
    expect(visible).toEqual([]);

    const withTrash = await harness.db
      .select()
      .from(s.tasks)
      .where(scope.whereIncludingDeleted(s.tasks));
    expect(withTrash).toHaveLength(1);

    await harness.db
      .update(s.tasks)
      .set({ deletedAt: null })
      .where(eq(s.tasks.id, orgs.orgA.taskId));
  });

  it('forces the caller org onto inserted values, overriding any client input', async () => {
    const scope = withOrg(harness.db, orgs.orgA.id);

    // A request body that tries to plant a row in another tenant.
    const hostile = { organizationId: orgs.orgB.id, name: 'planted', slug: 'planted' };
    const values = scope.values(hostile);

    expect(values.organizationId).toBe(orgs.orgA.id);
  });

  it('refuses an empty organization id rather than matching everything', () => {
    expect(() => withOrg(harness.db, '')).toThrow(/organization id/i);
  });
});

describe('schema invariants', () => {
  it('gives every domain table an organization_id', async () => {
    // Every exception is deliberate and has to earn its place here:
    //  - identity tables are global; a user exists across organizations
    //  - `organization` IS the tenant
    //  - `team_member` is scoped through `team`, which carries the org
    //  - `feature_flags` uses a null org row as the global default that
    //    org-specific rows override
    //  - `subscription` is keyed by Better Auth's `reference_id`
    const expectedExceptions = new Set([
      'user',
      'session',
      'account',
      'verification',
      'two_factor',
      'passkey',
      'organization',
      'team_member',
      'feature_flags',
      'subscription',
      '__drizzle_migrations',
    ]);

    const result = await harness.db.execute<{ table_name: string }>(sql`
      select t.table_name
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and not exists (
          select 1 from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = t.table_name
            and c.column_name = 'organization_id'
        )
      order by t.table_name
    `);

    const missing = result.rows
      .map((r) => r.table_name)
      .filter((name) => !expectedExceptions.has(name));

    expect(missing).toEqual([]);
  });

  it('indexes organization_id on every table that has one', async () => {
    const result = await harness.db.execute<{ table_name: string }>(sql`
      select c.table_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'organization_id'
        and not exists (
          select 1 from pg_indexes i
          where i.schemaname = 'public'
            and i.tablename = c.table_name
            and i.indexdef like '%organization_id%'
        )
      order by c.table_name
    `);

    expect(result.rows.map((r) => r.table_name)).toEqual([]);
  });

  it('indexes every foreign key column', async () => {
    // An unindexed FK turns a parent delete into a sequential scan of the child
    // table. The legacy app had no indexes at all outside user.email.
    const result = await harness.db.execute<{ table_name: string; column_name: string }>(sql`
      select kcu.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and not exists (
          select 1 from pg_indexes i
          where i.schemaname = 'public'
            and i.tablename = kcu.table_name
            and i.indexdef like '%' || kcu.column_name || '%'
        )
      order by 1, 2
    `);

    expect(result.rows).toEqual([]);
  });

  it('defaults timestamps in SQL, never at module load', async () => {
    // The legacy app used `default: new Date()`, so every row got the process
    // start time. Assert the database, not the ORM, produces the value.
    const before = new Date();
    const orgId = newId();

    await harness.db.insert(s.organization).values({
      id: orgId,
      name: 'Timestamp probe',
      slug: `probe-${orgId.slice(0, 8)}`,
    });

    const [row] = await harness.db
      .select()
      .from(s.organization)
      .where(eq(s.organization.id, orgId));

    expect(row?.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });
});

describe('uuid v7 ids', () => {
  it('generates ids that sort by creation time', async () => {
    const ids = Array.from({ length: 20 }, newId);
    const sorted = [...ids].sort();

    expect(sorted).toEqual(ids);
  });

  it('stores as a real uuid, so a malformed id is rejected by Postgres', async () => {
    await expect(
      harness.db.execute(sql`select * from tasks where id = 'not-a-uuid'`),
    ).rejects.toThrow();
  });
});
