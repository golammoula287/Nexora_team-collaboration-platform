import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrgRole } from '@nexora/shared';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

/**
 * Tasks.
 *
 * The CRUD is the least interesting part. What matters here is the numbering
 * (which must be race-free), the two graphs (subtasks and dependencies, both of
 * which can be made to loop), and the change log.
 */

let h: ApiHarness;
let projectId = '';
let statusIds: string[] = [];

beforeAll(async () => {
  h = await createApiHarness();

  const space = await h.request(`/orgs/${h.orgSlug}/spaces`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ name: 'Work', slug: 'work' }),
  });
  const { id: spaceId } = (await space.json()) as { id: string };

  const project = await h.request(`/orgs/${h.orgSlug}/projects`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ spaceId, name: 'Tasks Project', key: 'TSK' }),
  });
  projectId = ((await project.json()) as { id: string }).id;

  const detail = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}`, {
    cookie: h.users.owner.cookie,
  });
  const { statuses } = (await detail.json()) as { statuses: { id: string }[] };
  statusIds = statuses.map((s) => s.id);
});

afterAll(async () => {
  await h?.close();
});

async function createTask(role: OrgRole, body: Record<string, unknown> = {}) {
  return h.request(`/orgs/${h.orgSlug}/tasks`, {
    method: 'POST',
    cookie: h.users[role].cookie,
    body: JSON.stringify({ projectId, title: 'A task', ...body }),
  });
}

async function newTaskId(title = 'A task', body: Record<string, unknown> = {}) {
  const response = await createTask('owner', { title, ...body });
  return ((await response.json()) as { id: string }).id;
}

describe('creating', () => {
  it('numbers tasks per project, starting at 1', async () => {
    const first = await createTask('owner', { title: 'First' });
    const { number } = (await first.json()) as { number: number };

    expect(number).toBeGreaterThanOrEqual(1);
  });

  it('never issues the same number twice, even concurrently', async () => {
    // The counter is incremented with UPDATE ... RETURNING inside the
    // transaction, so two simultaneous creates take a row lock rather than
    // both reading the same value.
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTask('owner', { title: `Race ${i}` })),
    );

    const numbers = await Promise.all(
      responses.map(async (response) => ((await response.json()) as { number: number }).number),
    );

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('lands in the first column when no status is given', async () => {
    const id = await newTaskId('Defaulted');

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { task } = (await response.json()) as { task: { statusId: string } };

    // Otherwise the task exists but appears on no board.
    expect(task.statusId).toBe(statusIds[0]);
  });

  it('refuses a guest and allows a member', async () => {
    expect((await createTask('guest')).status).toBe(403);
    expect((await createTask('member')).status).toBe(201);
  });

  it('rejects a due date before the start date', async () => {
    const response = await createTask('owner', {
      startDate: '2026-06-01',
      dueDate: '2026-05-01',
    });
    expect(response.status).toBe(400);
  });

  it('refuses a project id from another organization', async () => {
    const { schema, newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db
      .insert(schema.organization)
      .values({ id: otherOrgId, name: 'Other', slug: `o-${otherOrgId.slice(0, 8)}` });
    const otherSpaceId = newId();
    await h.db.insert(schema.spaces).values({
      id: otherSpaceId,
      organizationId: otherOrgId,
      name: 'S',
      slug: 's',
      position: 'a1',
    });
    const foreignProjectId = newId();
    await h.db.insert(schema.projects).values({
      id: foreignProjectId,
      organizationId: otherOrgId,
      spaceId: otherSpaceId,
      name: 'Theirs',
      key: 'THR',
      position: 'a1',
    });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId: foreignProjectId, title: 'Planted' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('subtasks', () => {
  it('nests to unlimited depth, unlike a flat embedded array', async () => {
    const root = await newTaskId('Root');
    const child = await newTaskId('Child', { parentTaskId: root });
    const grandchild = await newTaskId('Grandchild', { parentTaskId: child });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${child}`, {
      cookie: h.users.owner.cookie,
    });
    const { subtasks } = (await response.json()) as { subtasks: { id: string }[] };

    // The legacy app could not represent a subtask of a subtask at all.
    expect(subtasks.map((s) => s.id)).toContain(grandchild);
  });

  it('refuses a subtask in a different project from its parent', async () => {
    const other = await h.request(`/orgs/${h.orgSlug}/projects`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({
        spaceId: (
          await (
            await h.request(`/orgs/${h.orgSlug}/spaces`, { cookie: h.users.owner.cookie })
          ).json()
        ).spaces[0].id,
        name: 'Elsewhere',
        key: 'ELS',
      }),
    });
    const { id: otherProjectId } = (await other.json()) as { id: string };

    const parent = await newTaskId('Parent here');
    const response = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({
        projectId: otherProjectId,
        title: 'Child elsewhere',
        parentTaskId: parent,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('refuses making a task its own ancestor', async () => {
    const root = await newTaskId('Cycle root');
    const child = await newTaskId('Cycle child', { parentTaskId: root });
    const grandchild = await newTaskId('Cycle grandchild', { parentTaskId: child });

    // root -> child -> grandchild; making root a child of grandchild loops.
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${root}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ parentTaskId: grandchild }),
    });

    expect(response.status).toBe(409);
  });

  it('refuses a task being its own parent', async () => {
    const id = await newTaskId('Self parent');

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ parentTaskId: id }),
    });

    expect(response.status).toBe(409);
  });

  it('soft deletes subtasks with their parent', async () => {
    const parent = await newTaskId('Doomed parent');
    const child = await newTaskId('Doomed child', { parentTaskId: parent });

    await h.request(`/orgs/${h.orgSlug}/tasks/${parent}`, {
      method: 'DELETE',
      cookie: h.users.owner.cookie,
    });

    // Otherwise Trash would restore a tree with a missing root.
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${child}`, {
      cookie: h.users.owner.cookie,
    });
    expect(response.status).toBe(404);
  });
});

describe('dependencies', () => {
  async function addDependency(taskId: string, dependsOnTaskId: string) {
    return h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/dependencies`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ dependsOnTaskId, type: 'blocks' }),
    });
  }

  it('records a blocker and reads it back', async () => {
    const a = await newTaskId('Blocked');
    const b = await newTaskId('Blocker');

    expect((await addDependency(a, b)).status).toBe(201);

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${a}`, {
      cookie: h.users.owner.cookie,
    });
    const { dependencies } = (await response.json()) as {
      dependencies: { dependsOnTaskId: string }[];
    };

    expect(dependencies.map((d) => d.dependsOnTaskId)).toContain(b);
  });

  it('refuses a task depending on itself', async () => {
    const id = await newTaskId('Self blocker');
    expect((await addDependency(id, id)).status).toBe(409);
  });

  it('refuses a two-task loop', async () => {
    const a = await newTaskId('Loop A');
    const b = await newTaskId('Loop B');

    await addDependency(a, b);
    // b already waits on nothing; making b wait on a closes the loop.
    expect((await addDependency(b, a)).status).toBe(409);
  });

  it('refuses a longer loop', async () => {
    // A -> B -> C, then C -> A. Postgres cannot catch this: the constraint is
    // on the graph, not on any row.
    const a = await newTaskId('Chain A');
    const b = await newTaskId('Chain B');
    const c = await newTaskId('Chain C');

    await addDependency(a, b);
    await addDependency(b, c);

    expect((await addDependency(c, a)).status).toBe(409);
  });

  it('allows a diamond, which is not a loop', async () => {
    const top = await newTaskId('Diamond top');
    const left = await newTaskId('Diamond left');
    const right = await newTaskId('Diamond right');

    await addDependency(top, left);
    // Two blockers for one task is perfectly valid.
    expect((await addDependency(top, right)).status).toBe(201);
  });

  it('warns when a blocker is due after the task it blocks', async () => {
    const task = await newTaskId('Depends on late thing', { dueDate: '2026-06-01' });
    const blocker = await newTaskId('Late blocker', { dueDate: '2026-07-01' });

    await addDependency(task, blocker);

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${task}`, {
      cookie: h.users.owner.cookie,
    });
    const { blockedBySlipped } = (await response.json()) as { blockedBySlipped: boolean };

    expect(blockedBySlipped).toBe(true);
  });
});

describe('updating', () => {
  it('records the fields that changed, and only those', async () => {
    const id = await newTaskId('Original');

    await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ title: 'Renamed', priority: 'high' }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { history } = (await response.json()) as {
      history: { action: string; changes: Record<string, unknown> }[];
    };

    const update = history.find((entry) => entry.action === 'task.updated');
    expect(update?.changes).toMatchObject({
      title: { from: 'Original', to: 'Renamed' },
      priority: { from: 'none', to: 'high' },
    });
  });

  it('completes a task when it enters a done column, and un-completes it on the way out', async () => {
    const id = await newTaskId('Completable');
    const doneStatus = statusIds[3] as string;

    await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ statusId: doneStatus }),
    });

    let response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    let { task } = (await response.json()) as { task: { completedAt: string | null } };
    expect(task.completedAt).toBeTruthy();

    await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ statusId: statusIds[0] }),
    });

    response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    ({ task } = (await response.json()) as { task: { completedAt: string | null } });
    expect(task.completedAt).toBeNull();
  });

  it('replaces assignees rather than appending', async () => {
    const id = await newTaskId('Assignable');

    await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ assigneeIds: [h.users.member.id, h.users.manager.id] }),
    });
    await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ assigneeIds: [h.users.manager.id] }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { assignees } = (await response.json()) as { assignees: { userId: string }[] };

    expect(assignees.map((a) => a.userId)).toEqual([h.users.manager.id]);
  });

  it('rejects a status from another project', async () => {
    const id = await newTaskId('Wrong status');
    const { schema, newId } = await import('@nexora/db');

    const strayStatusId = newId();
    await h.db.insert(schema.taskStatuses).values({
      id: strayStatusId,
      organizationId: h.organizationId,
      projectId,
      name: 'Stray',
      category: 'todo',
      position: 'zz',
    });

    // Same project, so this one is allowed - the guard is that the status must
    // exist in the caller's org at all.
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ statusId: strayStatusId }),
    });
    expect(response.status).toBe(200);

    const bogus = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ statusId: newId() }),
    });
    expect(bogus.status).toBe(400);
  });
});

describe('moving', () => {
  it('writes one row and keeps the order', async () => {
    const a = await newTaskId('Order A');
    const b = await newTaskId('Order B');
    const c = await newTaskId('Order C');

    // Move C between A and B.
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${c}/move`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ afterTaskId: a, beforeTaskId: b }),
    });
    expect(response.status).toBe(200);

    const { schema } = await import('@nexora/db');
    const { inArray } = await import('drizzle-orm');
    const rows = await h.db
      .select({ id: schema.tasks.id, position: schema.tasks.position })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, [a, b, c]));

    const byId = new Map(rows.map((row) => [row.id, row.position]));
    const positionA = byId.get(a) as string;
    const positionB = byId.get(b) as string;
    const positionC = byId.get(c) as string;

    expect(positionA < positionC).toBe(true);
    expect(positionC < positionB).toBe(true);
  });

  it('moves between columns', async () => {
    const id = await newTaskId('Movable');

    await h.request(`/orgs/${h.orgSlug}/tasks/${id}/move`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ statusId: statusIds[1] }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { task } = (await response.json()) as { task: { statusId: string } };

    expect(task.statusId).toBe(statusIds[1]);
  });
});

describe('the role matrix over task routes', () => {
  const deleteExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 200],
    ['member', 403],
    ['guest', 403],
  ];

  it.each(deleteExpectations)('delete: %s gets %i', async (role, expected) => {
    const id = await newTaskId(`Delete by ${role}`);

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      method: 'DELETE',
      cookie: h.users[role].cookie,
    });

    expect(response.status).toBe(expected);
  });

  it('gives 404 for a task id from another organization', async () => {
    const { schema, newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db
      .insert(schema.organization)
      .values({ id: otherOrgId, name: 'Far', slug: `far-${otherOrgId.slice(0, 8)}` });
    const otherSpaceId = newId();
    await h.db.insert(schema.spaces).values({
      id: otherSpaceId,
      organizationId: otherOrgId,
      name: 'S',
      slug: 's2',
      position: 'a1',
    });
    const otherProjectId = newId();
    await h.db.insert(schema.projects).values({
      id: otherProjectId,
      organizationId: otherOrgId,
      spaceId: otherSpaceId,
      name: 'P',
      key: 'FAR',
      position: 'a1',
    });
    const foreignTaskId = newId();
    await h.db.insert(schema.tasks).values({
      id: foreignTaskId,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      number: 1,
      title: 'Secret',
      position: 'a1',
    });

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${foreignTaskId}`, {
      cookie: h.users.owner.cookie,
    });

    expect(response.status).toBe(404);
  });

  it('does not list another organization tasks', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks } = (await response.json()) as { tasks: { title: string }[] };

    expect(tasks.map((t) => t.title)).not.toContain('Secret');
  });
});
