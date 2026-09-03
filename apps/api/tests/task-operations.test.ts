import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrgRole } from '@nexora/shared';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

/**
 * Bulk operations and Trash.
 *
 * The interesting failure mode is a partially applied batch: a selection with
 * one foreign id must change nothing at all, not "everything except that one".
 */

let h: ApiHarness;
let projectId = '';
let statusIds: string[] = [];

beforeAll(async () => {
  h = await createApiHarness();

  const space = await h.request(`/orgs/${h.orgSlug}/spaces`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ name: 'Ops', slug: 'ops' }),
  });
  const { id: spaceId } = (await space.json()) as { id: string };

  const project = await h.request(`/orgs/${h.orgSlug}/projects`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ spaceId, name: 'Ops Project', key: 'OPS' }),
  });
  projectId = ((await project.json()) as { id: string }).id;

  const detail = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}`, {
    cookie: h.users.owner.cookie,
  });
  statusIds = ((await detail.json()) as { statuses: { id: string }[] }).statuses.map((s) => s.id);
});

afterAll(async () => {
  await h?.close();
});

async function makeTasks(count: number, prefix = 'Bulk'): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const response = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: `${prefix} ${i}` }),
    });
    ids.push(((await response.json()) as { id: string }).id);
  }
  return ids;
}

async function bulkUpdate(role: OrgRole, taskIds: string[], patch: Record<string, unknown>) {
  return h.request(`/orgs/${h.orgSlug}/tasks/bulk`, {
    method: 'POST',
    cookie: h.users[role].cookie,
    body: JSON.stringify({ taskIds, patch }),
  });
}

describe('bulk edit', () => {
  it('applies one patch to a whole selection', async () => {
    const ids = await makeTasks(3, 'Priority');

    const response = await bulkUpdate('owner', ids, { priority: 'urgent' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ updated: 3 });

    const { schema } = await import('@nexora/db');
    const { inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ priority: schema.tasks.priority })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, ids));

    expect(rows.every((row) => row.priority === 'urgent')).toBe(true);
  });

  it('writes one audit row per task, not one for the batch', async () => {
    const ids = await makeTasks(3, 'Audited');
    await bulkUpdate('owner', ids, { priority: 'high' });

    const { schema } = await import('@nexora/db');
    const { and, eq, inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ entityId: schema.activities.entityId })
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.action, 'task.bulk_updated'),
          inArray(schema.activities.entityId, ids),
        ),
      );

    // "What happened to this task" has to stay answerable on the task itself.
    expect(new Set(rows.map((row) => row.entityId)).size).toBe(3);
  });

  it('changes nothing at all when one id is foreign', async () => {
    const ids = await makeTasks(2, 'Untouched');
    const { newId } = await import('@nexora/db');

    const response = await bulkUpdate('owner', [...ids, newId()], { priority: 'urgent' });
    expect(response.status).toBe(404);

    const { schema } = await import('@nexora/db');
    const { inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ priority: schema.tasks.priority })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, ids));

    // A half-applied bulk edit is worse than a refusal: the user cannot tell
    // which half worked.
    expect(rows.every((row) => row.priority === 'none')).toBe(true);
  });

  it('completes every task moved into a done column', async () => {
    const ids = await makeTasks(2, 'Completing');
    await bulkUpdate('owner', ids, { statusId: statusIds[3] });

    const { schema } = await import('@nexora/db');
    const { inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ completedAt: schema.tasks.completedAt })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, ids));

    expect(rows.every((row) => row.completedAt !== null)).toBe(true);
  });

  it('adds labels rather than replacing them', async () => {
    const ids = await makeTasks(2, 'Labelled');
    const { schema, newId } = await import('@nexora/db');

    const firstLabel = newId();
    const secondLabel = newId();
    await h.db.insert(schema.labels).values([
      { id: firstLabel, organizationId: h.organizationId, name: 'one', color: 'red' },
      { id: secondLabel, organizationId: h.organizationId, name: 'two', color: 'blue' },
    ]);

    await bulkUpdate('owner', ids, { addLabelIds: [firstLabel] });
    await bulkUpdate('owner', ids, { addLabelIds: [secondLabel] });

    const { inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ labelId: schema.taskLabels.labelId })
      .from(schema.taskLabels)
      .where(inArray(schema.taskLabels.taskId, ids));

    // Bulk-labelling a selection must not strip the labels it already has.
    expect(rows.length).toBe(4);
  });

  it('refuses an empty selection at the boundary', async () => {
    const response = await bulkUpdate('owner', [], { priority: 'high' });
    expect(response.status).toBe(400);
  });

  it('refuses a guest, and allows a member to edit', async () => {
    const ids = await makeTasks(1, 'Permission');

    expect((await bulkUpdate('guest', ids, { priority: 'low' })).status).toBe(403);
    expect((await bulkUpdate('member', ids, { priority: 'low' })).status).toBe(200);
  });
});

describe('bulk delete and trash', () => {
  async function bulkDelete(role: OrgRole, taskIds: string[]) {
    return h.request(`/orgs/${h.orgSlug}/tasks/bulk-delete`, {
      method: 'POST',
      cookie: h.users[role].cookie,
      body: JSON.stringify({ taskIds }),
    });
  }

  it('soft deletes a selection and lists it in trash', async () => {
    const ids = await makeTasks(3, 'Trashed');

    const response = await bulkDelete('owner', ids);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: 3 });

    const trash = await h.request(`/orgs/${h.orgSlug}/trash/tasks`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks } = (await trash.json()) as { tasks: { id: string; daysLeft: number }[] };

    for (const id of ids) {
      expect(tasks.map((task) => task.id)).toContain(id);
    }
    // Retention is reported so the user knows how long they have.
    expect(tasks[0]?.daysLeft).toBeLessThanOrEqual(30);
  });

  it('hides deleted tasks from the ordinary list', async () => {
    const ids = await makeTasks(2, 'Hidden');
    await bulkDelete('owner', ids);

    const list = await h.request(`/orgs/${h.orgSlug}/tasks`, { cookie: h.users.owner.cookie });
    const { tasks } = (await list.json()) as { tasks: { id: string }[] };

    for (const id of ids) {
      expect(tasks.map((task) => task.id)).not.toContain(id);
    }
  });

  it('takes subtasks down with the parent and brings them back together', async () => {
    const [parent] = await makeTasks(1, 'Parent');

    const child = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Child', parentTaskId: parent }),
    });
    const childId = ((await child.json()) as { id: string }).id;

    await bulkDelete('owner', [parent as string]);

    let response = await h.request(`/orgs/${h.orgSlug}/tasks/${childId}`, {
      cookie: h.users.owner.cookie,
    });
    expect(response.status).toBe(404);

    const restored = await h.request(`/orgs/${h.orgSlug}/trash/tasks/restore`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ taskIds: [parent] }),
    });
    expect(restored.status).toBe(200);

    // Restoring a parent without its subtasks would leave an incomplete tree.
    response = await h.request(`/orgs/${h.orgSlug}/tasks/${childId}`, {
      cookie: h.users.owner.cookie,
    });
    expect(response.status).toBe(200);
  });

  it('never hard deletes - the row survives', async () => {
    const ids = await makeTasks(1, 'Surviving');
    await bulkDelete('owner', ids);

    const { schema } = await import('@nexora/db');
    const { eq } = await import('drizzle-orm');
    const [row] = await h.db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, ids[0] as string));

    expect(row).toBeDefined();
    expect(row?.deletedAt).toBeTruthy();
  });

  it('refuses restoring something that was never deleted', async () => {
    const ids = await makeTasks(1, 'Alive');

    const response = await h.request(`/orgs/${h.orgSlug}/trash/tasks/restore`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ taskIds: ids }),
    });

    expect(response.status).toBe(404);
  });

  const trashExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 200],
    ['member', 403],
    ['guest', 403],
  ];

  it.each(trashExpectations)('trash: %s gets %i', async (role, expected) => {
    const response = await h.request(`/orgs/${h.orgSlug}/trash/tasks`, {
      cookie: h.users[role].cookie,
    });
    expect(response.status).toBe(expected);
  });

  it('does not show another organization deleted tasks', async () => {
    const { schema, newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db
      .insert(schema.organization)
      .values({ id: otherOrgId, name: 'Other', slug: `oth-${otherOrgId.slice(0, 8)}` });
    const otherSpaceId = newId();
    await h.db.insert(schema.spaces).values({
      id: otherSpaceId,
      organizationId: otherOrgId,
      name: 'S',
      slug: 's',
      position: 'a1',
    });
    const otherProjectId = newId();
    await h.db.insert(schema.projects).values({
      id: otherProjectId,
      organizationId: otherOrgId,
      spaceId: otherSpaceId,
      name: 'P',
      key: 'OTH',
      position: 'a1',
    });
    const foreignTaskId = newId();
    await h.db.insert(schema.tasks).values({
      id: foreignTaskId,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      number: 1,
      title: 'Their deleted task',
      position: 'a1',
      deletedAt: new Date(),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/trash/tasks`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks } = (await response.json()) as { tasks: { title: string }[] };

    expect(tasks.map((task) => task.title)).not.toContain('Their deleted task');
  });
});
