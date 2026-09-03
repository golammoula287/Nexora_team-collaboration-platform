import { count, eq, isNotNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/schema/index.js';
import { seed, type SeedResult } from '../src/seed.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';
import { withOrg } from '../src/tenancy.js';

/**
 * The seed is a deliverable, not a fixture: "every screen has real content on
 * first run". These tests assert it actually runs against the real schema and
 * produces enough data for each screen to be worth looking at.
 */

let harness: TestDatabase;
let result: SeedResult;

beforeAll(async () => {
  harness = await createTestDatabase();
  result = await seed(harness.db);
});

afterAll(async () => {
  await harness?.close();
});

describe('seed', () => {
  it('runs against the real migrations without error', () => {
    expect(result.organizationId).toBeTruthy();
    expect(result.userIds).toHaveLength(10);
    expect(result.projectIds).toHaveLength(6);
  });

  it('creates enough tasks for the board and list views to be meaningful', () => {
    expect(result.taskIds.length).toBeGreaterThanOrEqual(120);
  });

  it('puts every seeded row in exactly one organization', async () => {
    // The seed is also a tenancy test: if it wrote a row without an org, or
    // with the wrong one, this catches it.
    const tables = [
      s.spaces,
      s.projects,
      s.tasks,
      s.taskStatuses,
      s.comments,
      s.timeEntries,
      s.documents,
      s.messages,
      s.companies,
      s.contacts,
      s.deals,
      s.invoices,
      s.goals,
    ] as const;

    for (const table of tables) {
      const rows = await harness.db
        .select({ organizationId: table.organizationId })
        .from(table)
        .groupBy(table.organizationId);

      expect(rows).toEqual([{ organizationId: result.organizationId }]);
    }
  });

  it('is reachable through withOrg, the path the app uses', async () => {
    const scope = withOrg(harness.db, result.organizationId);

    const [projects] = await harness.db
      .select({ n: count() })
      .from(s.projects)
      .where(scope.where(s.projects));

    expect(projects?.n).toBe(6);
  });

  it('gives every screen something to render', async () => {
    const minimums: [string, Promise<{ n: number }[]>, number][] = [
      ['users', harness.db.select({ n: count() }).from(s.user), 10],
      ['spaces', harness.db.select({ n: count() }).from(s.spaces), 3],
      ['statuses', harness.db.select({ n: count() }).from(s.taskStatuses), 24],
      ['assignees', harness.db.select({ n: count() }).from(s.taskAssignees), 50],
      ['dependencies', harness.db.select({ n: count() }).from(s.taskDependencies), 10],
      ['comments', harness.db.select({ n: count() }).from(s.comments), 20],
      ['attachments', harness.db.select({ n: count() }).from(s.attachments), 1],
      ['time entries', harness.db.select({ n: count() }).from(s.timeEntries), 20],
      ['sprints', harness.db.select({ n: count() }).from(s.sprints), 2],
      ['milestones', harness.db.select({ n: count() }).from(s.milestones), 6],
      ['documents', harness.db.select({ n: count() }).from(s.documents), 4],
      ['channels', harness.db.select({ n: count() }).from(s.channels), 3],
      ['messages', harness.db.select({ n: count() }).from(s.messages), 18],
      ['companies', harness.db.select({ n: count() }).from(s.companies), 4],
      ['contacts', harness.db.select({ n: count() }).from(s.contacts), 8],
      ['deals', harness.db.select({ n: count() }).from(s.deals), 6],
      ['invoices', harness.db.select({ n: count() }).from(s.invoices), 3],
      ['invoice lines', harness.db.select({ n: count() }).from(s.invoiceLines), 9],
      ['project costs', harness.db.select({ n: count() }).from(s.projectCosts), 9],
      ['goals', harness.db.select({ n: count() }).from(s.goals), 2],
      ['key results', harness.db.select({ n: count() }).from(s.keyResults), 2],
      ['notifications', harness.db.select({ n: count() }).from(s.notifications), 1],
    ];

    for (const [label, query, minimum] of minimums) {
      const [row] = await query;
      expect(row?.n, `${label} should have at least ${minimum} rows`).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  it('covers every role, so each can be signed in as', async () => {
    const roles = await harness.db
      .select({ role: s.member.role })
      .from(s.member)
      .groupBy(s.member.role);

    const found = new Set(roles.map((r) => r.role));
    for (const role of ['owner', 'admin', 'manager', 'member', 'guest']) {
      expect(found.has(role as never)).toBe(true);
    }
  });

  it('creates real nested subtasks, not a flat list', async () => {
    const [row] = await harness.db
      .select({ n: count() })
      .from(s.tasks)
      .where(isNotNull(s.tasks.parentTaskId));

    expect(row?.n).toBeGreaterThan(0);
  });

  it('creates no circular dependencies', async () => {
    const cycles = await harness.db.execute<{ n: number }>(sql`
      select count(*)::int as n
      from task_dependencies a
      join task_dependencies b
        on a.task_id = b.depends_on_task_id
       and a.depends_on_task_id = b.task_id
    `);

    expect(cycles.rows[0]?.n).toBe(0);
  });

  it('keeps task numbers unique within a project', async () => {
    const duplicates = await harness.db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select project_id, number from tasks group by project_id, number having count(*) > 1
      ) d
    `);

    expect(duplicates.rows[0]?.n).toBe(0);
  });

  it('gives the deal pipeline every stage a column needs', async () => {
    const stages = await harness.db
      .select({ stage: s.deals.stage })
      .from(s.deals)
      .groupBy(s.deals.stage);

    const found = new Set(stages.map((r) => r.stage));
    expect(found.has('lead')).toBe(true);
    expect(found.has('won')).toBe(true);
    expect(found.has('lost')).toBe(true);
  });

  it('produces a project P&L that can actually be computed', async () => {
    // profit = rate - sum(costs), derived rather than stored.
    const pnl = await harness.db.execute<{
      project_id: string;
      rate: string;
      costs: string;
      profit: string;
    }>(sql`
      select b.project_id,
             b.rate,
             coalesce(sum(c.amount), 0) as costs,
             b.rate - coalesce(sum(c.amount), 0) as profit
      from project_budgets b
      left join project_costs c on c.project_id = b.project_id
      group by b.project_id, b.rate
    `);

    expect(pnl.rows.length).toBeGreaterThan(0);
    for (const row of pnl.rows) {
      expect(Number(row.profit)).toBe(Number(row.rate) - Number(row.costs));
    }
  });

  it('never leaves a task pointing at another project', async () => {
    const orphans = await harness.db.execute<{ n: number }>(sql`
      select count(*)::int as n
      from tasks child
      join tasks parent on parent.id = child.parent_task_id
      where child.project_id <> parent.project_id
         or child.organization_id <> parent.organization_id
    `);

    expect(orphans.rows[0]?.n).toBe(0);
  });

  it('sets created_at from the database on every seeded task', async () => {
    const nulls = await harness.db
      .select({ n: count() })
      .from(s.tasks)
      .where(eq(sql`created_at is null`, true));

    expect(nulls[0]?.n ?? 0).toBe(0);
  });
});
