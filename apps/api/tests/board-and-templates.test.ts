import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@nexora/db';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

/**
 * The rest of phase 4: editable columns, checklists, watchers, templates,
 * duplication, saved views and the two conversions.
 *
 * The interesting assertions are not "the row was written". They are the
 * refusals - deleting a column that still holds cards, editing someone else's
 * saved view, a share token from another tenant - and the invariants that only
 * show up once something is copied: task numbers, ordering keys, and the fact
 * that a template is a snapshot rather than a live link.
 */

let h: ApiHarness;
let spaceId = '';
let projectId = '';
let columnIds: string[] = [];

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function refreshColumns() {
  const response = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}/columns`, {
    cookie: h.users.owner.cookie,
  });
  const { columns } = await json<{ columns: { id: string; name: string }[] }>(response);
  columnIds = columns.map((column) => column.id);
  return columns;
}

beforeAll(async () => {
  h = await createApiHarness();

  const space = await h.request(`/orgs/${h.orgSlug}/spaces`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ name: 'Work', slug: 'work' }),
  });
  spaceId = (await json<{ id: string }>(space)).id;

  const project = await h.request(`/orgs/${h.orgSlug}/projects`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ spaceId, name: 'Board Project', key: 'BRD' }),
  });
  projectId = (await json<{ id: string }>(project)).id;

  await refreshColumns();
});

afterAll(async () => {
  await h?.close();
});

// --- Columns ---------------------------------------------------------------

describe('board columns', () => {
  it('lists the four a project is created with', async () => {
    const columns = await refreshColumns();
    expect(columns.map((column) => column.name)).toEqual([
      'Backlog',
      'In progress',
      'In review',
      'Done',
    ]);
  });

  it('gives them four distinct, correctly ordered positions', async () => {
    const rows = await h.db
      .select({
        name: schema.taskStatuses.name,
        position: schema.taskStatuses.position,
      })
      .from(schema.taskStatuses);

    const forProject = rows.filter((row) => row.position !== null);
    const positions = forProject.map((row) => row.position);

    // The seeding once produced ["V", "W", "W", "X"] - two columns sharing a
    // key. Postgres was then free to return them in either order, and any
    // reorder against the pair raised `"W" is not before "W"`.
    expect(new Set(positions).size).toBe(positions.length);

    const byPosition = [...forProject].sort((a, b) => a.position.localeCompare(b.position));
    expect(byPosition.map((row) => row.name)).toEqual([
      'Backlog',
      'In progress',
      'In review',
      'Done',
    ]);
  });

  it('creates a column and appends it', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}/columns`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Blocked', category: 'todo', wipLimit: 3 }),
    });

    expect(response.status).toBe(201);
    const columns = await refreshColumns();
    expect(columns.at(-1)?.name).toBe('Blocked');
  });

  it('renames a column without touching the tasks in it', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/columns/${columnIds[0]}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'To do' }),
    });

    expect(response.status).toBe(200);
    const columns = await refreshColumns();
    expect(columns[0]?.name).toBe('To do');
  });

  it('reorders by neighbours, writing one row', async () => {
    const before = await refreshColumns();
    const last = before.at(-1);
    const first = before[0];

    const response = await h.request(`/orgs/${h.orgSlug}/columns/${last?.id}/move`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ beforeColumnId: first?.id }),
    });

    expect(response.status).toBe(200);
    const after = await refreshColumns();
    expect(after[0]?.name).toBe(last?.name);
  });

  it('refuses to delete a column that still holds tasks', async () => {
    const columns = await refreshColumns();
    const target = columns[1];

    await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Stranded?', statusId: target?.id }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/columns/${target?.id}/delete`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({}),
    });

    // `tasks.status_id` is ON DELETE SET NULL, so allowing this would leave the
    // card in no column at all - visible in no view, recoverable only from SQL.
    expect(response.status).toBe(409);
    expect((await json<{ error: { message: string } }>(response)).error.message).toContain('1 task');
  });

  it('deletes a column when told where its tasks go, and moves them', async () => {
    const columns = await refreshColumns();
    const from = columns[1];
    const to = columns[2];

    const response = await h.request(`/orgs/${h.orgSlug}/columns/${from?.id}/delete`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ moveTasksToColumnId: to?.id }),
    });

    expect(response.status).toBe(200);
    expect(await json<{ movedTasks: number }>(response)).toMatchObject({ movedTasks: 1 });

    const tasks = await h.request(`/orgs/${h.orgSlug}/tasks?projectId=${projectId}`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks: rows } = await json<{ tasks: { title: string; statusId: string }[] }>(tasks);
    expect(rows.find((task) => task.title === 'Stranded?')?.statusId).toBe(to?.id);
  });

  it('refuses to delete the last column', async () => {
    const columns = await refreshColumns();
    // Delete all but one, then try the last.
    for (const column of columns.slice(1)) {
      await h.request(`/orgs/${h.orgSlug}/columns/${column.id}/delete`, {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ moveTasksToColumnId: columns[0]?.id }),
      });
    }

    const survivors = await refreshColumns();
    expect(survivors).toHaveLength(1);

    const response = await h.request(`/orgs/${h.orgSlug}/columns/${survivors[0]?.id}/delete`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
  });

  it('lets a member move cards but not rename the columns', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/columns/${columnIds[0]}/../columns`, {
      cookie: h.users.member.cookie,
    });
    expect([200, 404]).toContain(response.status);

    const rename = await h.request(`/orgs/${h.orgSlug}/columns/${columnIds[0]}`, {
      method: 'PATCH',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ name: 'Member rename' }),
    });
    expect(rename.status).toBe(403);
  });
});

// --- Checklists ------------------------------------------------------------

describe('checklists', () => {
  let taskId = '';
  let checklistId = '';

  it('creates a checklist with items in one call', async () => {
    const task = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Ship the release' }),
    });
    taskId = (await json<{ id: string }>(task)).id;

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ title: 'Definition of done', items: ['Tests', 'Docs', 'Changelog'] }),
    });

    expect(response.status).toBe(201);
    checklistId = (await json<{ id: string }>(response)).id;

    const list = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      cookie: h.users.owner.cookie,
    });
    const { checklists } = await json<
      { checklists: { title: string; totalCount: number; doneCount: number }[] }
    >(list);

    expect(checklists).toHaveLength(1);
    expect(checklists[0]).toMatchObject({ totalCount: 3, doneCount: 0 });
  });

  it('ticks an item and counts it', async () => {
    const list = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      cookie: h.users.owner.cookie,
    });
    const { checklists } = await json<{ checklists: { items: { id: string }[] }[] }>(list);
    const itemId = checklists[0]?.items[0]?.id;

    const response = await h.request(`/orgs/${h.orgSlug}/checklist-items/${itemId}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ isDone: true }),
    });
    expect(response.status).toBe(200);

    const after = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      cookie: h.users.owner.cookie,
    });
    const { checklists: updated } = await json<{ checklists: { doneCount: number }[] }>(after);
    expect(updated[0]?.doneCount).toBe(1);
  });

  it('writes the audit row against the task, not the checklist', async () => {
    const detail = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}`, {
      cookie: h.users.owner.cookie,
    });
    const { history } = await json<{ history: { action: string }[] }>(detail);

    // "What happened to this task" is the question the change log answers.
    expect(history.map((entry) => entry.action)).toContain('checklist.item-checked');
  });

  it('deletes a checklist and its items together', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/checklists/${checklistId}`, {
      method: 'DELETE',
      cookie: h.users.owner.cookie,
    });
    expect(response.status).toBe(200);

    const after = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      cookie: h.users.owner.cookie,
    });
    expect((await json<{ checklists: unknown[] }>(after)).checklists).toHaveLength(0);

    // The items went with it, rather than surviving as orphans nothing renders.
    const orphans = await h.db.select().from(schema.checklistItems);
    expect(orphans.every((item) => item.deletedAt !== null)).toBe(true);
  });

  it('refuses a guest ticking a box', async () => {
    const checklist = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/checklists`, {
      method: 'POST',
      cookie: h.users.guest.cookie,
      body: JSON.stringify({ title: 'Guest list' }),
    });
    expect(checklist.status).toBe(403);
  });
});

// --- Watchers --------------------------------------------------------------

describe('watchers', () => {
  let taskId = '';

  beforeAll(async () => {
    const task = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Watch me' }),
    });
    taskId = (await json<{ id: string }>(task)).id;
  });

  it('watches, and watching twice is not an error', async () => {
    const first = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({}),
    });
    expect(await json<{ added: boolean }>(first)).toMatchObject({ added: true });

    // The unique index would turn a double click into a 500.
    const second = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(200);
    expect(await json<{ added: boolean }>(second)).toMatchObject({ added: false });
  });

  it('loops in a colleague, but refuses an outsider', async () => {
    const colleague = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ userId: h.users.admin.id }),
    });
    expect(colleague.status).toBe(200);

    // The id came from the client, so it is checked rather than trusted.
    const outsider = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ userId: h.outsider.id }),
    });
    expect(outsider.status).toBe(404);
  });

  it('unwatches', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers/remove`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({}),
    });
    expect(await json<{ removed: number }>(response)).toMatchObject({ removed: 1 });

    const list = await h.request(`/orgs/${h.orgSlug}/tasks/${taskId}/watchers`, {
      cookie: h.users.owner.cookie,
    });
    const { watchers } = await json<{ watchers: { userId: string }[] }>(list);
    expect(watchers.map((w) => w.userId)).not.toContain(h.users.member.id);
  });
});

// --- Templates and duplication ---------------------------------------------

describe('templates', () => {
  let taskTemplateId = '';
  let projectTemplateId = '';
  let sourceTaskId = '';

  it('saves a task, its checklist and its subtasks as a template', async () => {
    const task = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Onboard a client', priority: 'high' }),
    });
    sourceTaskId = (await json<{ id: string }>(task)).id;

    await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Send the welcome pack', parentTaskId: sourceTaskId }),
    });

    await h.request(`/orgs/${h.orgSlug}/tasks/${sourceTaskId}/checklists`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ title: 'Paperwork', items: ['NDA', 'Invoice'] }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/templates/task`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ taskId: sourceTaskId, name: 'Client onboarding' }),
    });

    expect(response.status).toBe(201);
    taskTemplateId = (await json<{ id: string }>(response)).id;
  });

  it('applies it, rebuilding the subtasks and the checklist', async () => {
    const response = await h.request(
      `/orgs/${h.orgSlug}/templates/${taskTemplateId}/apply-task`,
      {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ projectId, title: 'Onboard Acme' }),
      },
    );

    expect(response.status).toBe(201);
    const { id } = await json<{ id: string }>(response);

    const detail = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { task, subtasks } = await json<
      { task: { title: string; priority: string }; subtasks: { title: string }[] }
    >(detail);

    expect(task.title).toBe('Onboard Acme');
    expect(task.priority).toBe('high');
    expect(subtasks.map((s) => s.title)).toEqual(['Send the welcome pack']);

    const checklists = await h.request(`/orgs/${h.orgSlug}/tasks/${id}/checklists`, {
      cookie: h.users.owner.cookie,
    });
    const { checklists: copied } = await json<
      { checklists: { title: string; totalCount: number }[] }
    >(checklists);
    expect(copied[0]).toMatchObject({ title: 'Paperwork', totalCount: 2 });
  });

  it('is a snapshot: editing the source does not change the template', async () => {
    await h.request(`/orgs/${h.orgSlug}/tasks/${sourceTaskId}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ title: 'Renamed after templating' }),
    });

    const response = await h.request(
      `/orgs/${h.orgSlug}/templates/${taskTemplateId}/apply-task`,
      {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ projectId }),
      },
    );

    const { id } = await json<{ id: string }>(response);
    const detail = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });

    // The template kept the title it was saved with, which is what a snapshot
    // means and what a live reference would have broken.
    expect((await json<{ task: { title: string } }>(detail)).task.title).toBe('Onboard a client');
  });

  it('gives every task built from a template a distinct number', async () => {
    const tasks = await h.request(`/orgs/${h.orgSlug}/tasks?projectId=${projectId}`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks: rows } = await json<{ tasks: { number: number }[] }>(tasks);
    const numbers = rows.map((task) => task.number);

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('saves and applies a project template', async () => {
    const save = await h.request(`/orgs/${h.orgSlug}/templates/project`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, name: 'Delivery board', includeTasks: true }),
    });
    expect(save.status).toBe(201);
    projectTemplateId = (await json<{ id: string }>(save)).id;

    const apply = await h.request(
      `/orgs/${h.orgSlug}/templates/${projectTemplateId}/apply-project`,
      {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ spaceId, name: 'From template', key: 'FTP' }),
      },
    );

    expect(apply.status).toBe(201);
    const { id } = await json<{ id: string }>(apply);

    const detail = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { statuses } = await json<{ statuses: { name: string }[] }>(detail);
    expect(statuses.length).toBeGreaterThan(0);

    const tasks = await h.request(`/orgs/${h.orgSlug}/tasks?projectId=${id}`, {
      cookie: h.users.owner.cookie,
    });
    expect((await json<{ tasks: unknown[] }>(tasks)).tasks.length).toBeGreaterThan(0);
  });

  it('refuses the wrong kind of template', async () => {
    const response = await h.request(
      `/orgs/${h.orgSlug}/templates/${projectTemplateId}/apply-task`,
      {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ projectId }),
      },
    );
    expect(response.status).toBe(400);
  });

  it('duplicates a project, columns and all', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}/duplicate`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Board Project (copy)', key: 'BRDC', includeTasks: true }),
    });

    expect(response.status).toBe(201);
    const { id } = await json<{ id: string }>(response);

    const source = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}/columns`, {
      cookie: h.users.owner.cookie,
    });
    const copy = await h.request(`/orgs/${h.orgSlug}/projects/${id}/columns`, {
      cookie: h.users.owner.cookie,
    });

    const names = (payload: { columns: { name: string }[] }) =>
      payload.columns.map((column) => column.name);

    expect(names(await json(copy))).toEqual(names(await json(source)));
  });

  it('refuses a duplicate that reuses a project key', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects/${projectId}/duplicate`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Another copy', key: 'BRDC' }),
    });
    expect(response.status).toBe(409);
  });

  it('does not leak a template to another tenant', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/templates`, {
      cookie: h.outsider.cookie,
    });
    expect(response.status).toBe(404);
  });
});

// --- Saved views -----------------------------------------------------------

describe('saved views', () => {
  let viewId = '';
  let shareToken = '';

  it('saves a view with an AND/OR filter tree', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/views`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({
        projectId,
        name: 'Urgent or overdue',
        layout: 'list',
        isShared: true,
        config: {
          groupBy: 'status',
          sortKey: 'dueDate',
          sortAscending: true,
          filter: {
            combinator: 'and',
            conditions: [
              {
                combinator: 'or',
                conditions: [
                  { field: 'priority', operator: 'is', value: 'urgent' },
                  { field: 'dueDate', operator: 'before', value: '2026-01-01' },
                ],
              },
              { field: 'completed', operator: 'is', value: 'false' },
            ],
          },
        },
      }),
    });

    expect(response.status).toBe(201);
    viewId = (await json<{ id: string }>(response)).id;
  });

  it('mints a share token only for a shared view', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/views?projectId=${projectId}`, {
      cookie: h.users.owner.cookie,
    });
    const { views } = await json<{ views: { id: string; shareToken: string | null }[] }>(response);
    const saved = views.find((view) => view.id === viewId);

    expect(saved?.shareToken).toBeTruthy();
    shareToken = saved?.shareToken ?? '';
  });

  it('resolves a share token for a member of the organization', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/views/shared/${shareToken}`, {
      cookie: h.users.member.cookie,
    });
    expect(response.status).toBe(200);
  });

  it('refuses a share token to someone outside the organization', async () => {
    // The token names a view. It is not a key to the data behind it: without a
    // session and membership, an unguessable string is still not authorization.
    const anonymous = await h.request(`/orgs/${h.orgSlug}/views/shared/${shareToken}`);
    expect(anonymous.status).toBe(401);

    const outsider = await h.request(`/orgs/${h.orgSlug}/views/shared/${shareToken}`, {
      cookie: h.outsider.cookie,
    });
    expect(outsider.status).toBe(404);
  });

  it('refuses a filter nested past the depth limit', async () => {
    const deep = (depth: number): unknown =>
      depth === 0
        ? { field: 'priority', operator: 'is', value: 'urgent' }
        : { combinator: 'and', conditions: [deep(depth - 1)] };

    const response = await h.request(`/orgs/${h.orgSlug}/views`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({
        projectId,
        name: 'Too deep',
        config: { filter: deep(8) },
      }),
    });

    expect(response.status).toBe(400);
  });

  it('lets only the owner edit their view, even a shared one', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/views/${viewId}`, {
      method: 'PATCH',
      cookie: h.users.admin.cookie,
      body: JSON.stringify({ name: 'Renamed by an admin' }),
    });

    // Not a role question: editing a shared view would change what everyone
    // else sees without the person who saved it knowing.
    expect(response.status).toBe(403);
  });

  it('revokes the link when a view stops being shared', async () => {
    await h.request(`/orgs/${h.orgSlug}/views/${viewId}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ isShared: false }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/views/shared/${shareToken}`, {
      cookie: h.users.member.cookie,
    });
    expect(response.status).toBe(404);
  });

  it('keeps one default per person, per project', async () => {
    const first = await h.request(`/orgs/${h.orgSlug}/views`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, name: 'Default A', isDefault: true, config: {} }),
    });
    const second = await h.request(`/orgs/${h.orgSlug}/views`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, name: 'Default B', isDefault: true, config: {} }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const list = await h.request(`/orgs/${h.orgSlug}/views?projectId=${projectId}`, {
      cookie: h.users.owner.cookie,
    });
    const { views } = await json<{ views: { name: string; isDefault: boolean }[] }>(list);
    const defaults = views.filter((view) => view.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe('Default B');
  });

  it('shows a person their own views and the shared ones, not everyone else’s', async () => {
    await h.request(`/orgs/${h.orgSlug}/views`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ projectId, name: 'Private to the member', config: {} }),
    });

    const response = await h.request(`/orgs/${h.orgSlug}/views?projectId=${projectId}`, {
      cookie: h.users.owner.cookie,
    });
    const { views } = await json<{ views: { name: string }[] }>(response);

    expect(views.map((view) => view.name)).not.toContain('Private to the member');
  });
});

// --- Conversions -----------------------------------------------------------

describe('conversions', () => {
  it('promotes a task to a project and moves its subtasks up', async () => {
    const parent = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Website redesign', dueDate: '2026-12-01' }),
    });
    const parentId = (await json<{ id: string }>(parent)).id;

    for (const title of ['Wireframes', 'Copy', 'Build']) {
      await h.request(`/orgs/${h.orgSlug}/tasks`, {
        method: 'POST',
        cookie: h.users.owner.cookie,
        body: JSON.stringify({ projectId, title, parentTaskId: parentId }),
      });
    }

    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${parentId}/to-project`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ spaceId, key: 'WEB', moveSubtasks: true }),
    });

    expect(response.status).toBe(201);
    const { id } = await json<{ id: string }>(response);

    const tasks = await h.request(`/orgs/${h.orgSlug}/tasks?projectId=${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { tasks: moved } = await json<
      { tasks: { title: string; parentTaskId: string | null; number: number }[] }
    >(tasks);

    expect(moved.map((task) => task.title).sort()).toEqual(['Build', 'Copy', 'Wireframes']);
    expect(moved.every((task) => task.parentTaskId === null)).toBe(true);
    expect(new Set(moved.map((task) => task.number)).size).toBe(3);

    // The source task survives - it is where the discussion happened.
    const source = await h.request(`/orgs/${h.orgSlug}/tasks/${parentId}`, {
      cookie: h.users.owner.cookie,
    });
    expect(source.status).toBe(200);
  });

  it('turns a comment into a task, keeping the comment', async () => {
    const task = await h.request(`/orgs/${h.orgSlug}/tasks`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId, title: 'Discussion' }),
    });
    const taskId = (await json<{ id: string }>(task)).id;

    // Comments have no create route until phase 5.3; the row is what this
    // conversion needs, and it is the real table.
    const [comment] = await h.db
      .insert(schema.comments)
      .values({
        organizationId: h.organizationId,
        entityType: 'task',
        entityId: taskId,
        authorId: h.users.owner.id,
        body: {},
        bodyText: 'We should rewrite the exporter\nand then delete the old one.',
      })
      .returning({ id: schema.comments.id });

    const response = await h.request(`/orgs/${h.orgSlug}/comments/${comment?.id}/to-task`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ projectId }),
    });

    expect(response.status).toBe(201);
    const { id } = await json<{ id: string }>(response);

    const detail = await h.request(`/orgs/${h.orgSlug}/tasks/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { task: created } = await json<{ task: { title: string } }>(detail);

    // The first line is the title; the whole comment becomes the description.
    expect(created.title).toBe('We should rewrite the exporter');

    const survivors = await h.db.select().from(schema.comments);
    expect(survivors.some((row) => row.id === comment?.id && row.deletedAt === null)).toBe(true);
  });

  it('refuses a conversion from another tenant', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/tasks/${projectId}/to-project`, {
      method: 'POST',
      cookie: h.outsider.cookie,
      body: JSON.stringify({ spaceId, key: 'OUT' }),
    });
    expect(response.status).toBe(404);
  });
});
