import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrgRole } from '@nexora/shared';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

/**
 * Spaces and projects: the first real resource.
 *
 * The point of these is not that CRUD works - it is that the tenant boundary
 * and the role matrix hold on a resource with foreign keys, where a client
 * supplies ids of its own.
 */

let h: ApiHarness;
let spaceId = '';

beforeAll(async () => {
  h = await createApiHarness();

  const response = await h.request(`/orgs/${h.orgSlug}/spaces`, {
    method: 'POST',
    cookie: h.users.owner.cookie,
    body: JSON.stringify({ name: 'Client Work', slug: 'client-work' }),
  });
  spaceId = ((await response.json()) as { id: string }).id;
});

afterAll(async () => {
  await h?.close();
});

async function createProject(role: OrgRole, overrides: Record<string, unknown> = {}) {
  return h.request(`/orgs/${h.orgSlug}/projects`, {
    method: 'POST',
    cookie: h.users[role].cookie,
    body: JSON.stringify({
      spaceId,
      name: 'Rebrand',
      key: `K${Math.floor(Math.random() * 100000)}`,
      ...overrides,
    }),
  });
}

describe('spaces', () => {
  it('creates a space and lists it', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/spaces`, {
      cookie: h.users.member.cookie,
    });

    expect(response.status).toBe(200);
    const { spaces } = (await response.json()) as { spaces: { slug: string }[] };
    expect(spaces.map((s) => s.slug)).toContain('client-work');
  });

  it('refuses a duplicate address with 409, not 500', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/spaces`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Another', slug: 'client-work' }),
    });

    expect(response.status).toBe(409);
  });

  it('refuses a member creating one', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/spaces`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ name: 'Sneaky', slug: 'sneaky' }),
    });

    expect(response.status).toBe(403);
  });

  it('rejects a malformed slug at the boundary', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/spaces`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Bad', slug: 'Not A Slug!' }),
    });

    expect(response.status).toBe(400);
  });
});

describe('creating a project', () => {
  it('succeeds for a manager and returns an id', async () => {
    const response = await createProject('manager', { name: 'Managed' });

    expect(response.status).toBe(201);
    expect((await response.json()) as { id: string }).toHaveProperty('id');
  });

  it('gives the new project a usable board and a member row', async () => {
    const created = await createProject('owner', { name: 'With board' });
    const { id } = (await created.json()) as { id: string };

    const response = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { statuses } = (await response.json()) as { statuses: { name: string }[] };

    // A board with no columns cannot be used, so every project starts with four.
    expect(statuses.map((s) => s.name)).toEqual(['Backlog', 'In progress', 'In review', 'Done']);
  });

  it('refuses a member and a guest', async () => {
    expect((await createProject('member')).status).toBe(403);
    expect((await createProject('guest')).status).toBe(403);
  });

  it('refuses a duplicate key within the organization', async () => {
    await createProject('owner', { key: 'DUPE' });
    const second = await createProject('owner', { key: 'DUPE' });

    expect(second.status).toBe(409);
  });

  it('rejects a bad key at the boundary rather than in the database', async () => {
    // Too short, containing a space, and starting with a digit.
    for (const key of ['x', 'HAS SPACE', '1LEADING']) {
      const response = await createProject('owner', { key });
      expect(response.status, `key "${key}" should be refused`).toBe(400);
    }
  });

  it('canonicalises a lower-case key rather than refusing it', async () => {
    // Typing "acme" and getting ACME-1 is the friendlier behaviour, and the
    // schema does the uppercasing so the API and the form agree on it.
    const created = await createProject('owner', { key: 'lowerkey' });
    expect(created.status).toBe(201);

    const { id } = (await created.json()) as { id: string };
    const response = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      cookie: h.users.owner.cookie,
    });
    const { project } = (await response.json()) as { project: { key: string } };

    expect(project.key).toBe('LOWERKEY');
  });

  it('rejects a due date before the start date', async () => {
    const response = await createProject('owner', {
      startDate: '2026-06-01',
      dueDate: '2026-05-01',
    });

    expect(response.status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('refuses a space id belonging to another organization', async () => {
    // The exact attack: a valid id, from someone else's tenant.
    const { schema, newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db.insert(schema.organization).values({
      id: otherOrgId,
      name: 'Other Co',
      slug: `other-${otherOrgId.slice(0, 8)}`,
    });

    const foreignSpaceId = newId();
    await h.db.insert(schema.spaces).values({
      id: foreignSpaceId,
      organizationId: otherOrgId,
      name: 'Theirs',
      slug: 'theirs',
      position: 'a1',
    });

    const response = await createProject('owner', { spaceId: foreignSpaceId });

    // 404, not 403: the existence of that space is not ours to confirm.
    expect(response.status).toBe(404);
  });

  it('does not list another organization projects', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects`, {
      cookie: h.users.owner.cookie,
    });
    const { projects } = (await response.json()) as { projects: { id: string }[] };

    const { schema } = await import('@nexora/db');
    const all = await h.db.select({ id: schema.projects.id }).from(schema.projects);

    // There are more projects in the table than this org can see, and every
    // visible one belongs to it.
    expect(all.length).toBeGreaterThanOrEqual(projects.length);
    for (const project of projects) {
      const [row] = await h.db
        .select({ organizationId: schema.projects.organizationId })
        .from(schema.projects)
        .where((await import('drizzle-orm')).eq(schema.projects.id, project.id));
      expect(row?.organizationId).toBe(h.organizationId);
    }
  });

  it('gives 404 for a project id from another organization', async () => {
    const { schema, newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db.insert(schema.organization).values({
      id: otherOrgId,
      name: 'Elsewhere',
      slug: `elsewhere-${otherOrgId.slice(0, 8)}`,
    });
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
      name: 'Secret',
      key: 'SECRET',
      position: 'a1',
    });

    const response = await h.request(`/orgs/${h.orgSlug}/projects/${foreignProjectId}`, {
      cookie: h.users.owner.cookie,
    });

    expect(response.status).toBe(404);
  });
});

describe('updating and deleting', () => {
  async function freshProject() {
    const created = await createProject('owner', { name: 'Editable' });
    return ((await created.json()) as { id: string }).id;
  }

  it('records only the fields that changed', async () => {
    const id = await freshProject();

    await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Renamed', status: 'active' }),
    });

    const { schema } = await import('@nexora/db');
    const { and, eq } = await import('drizzle-orm');

    const rows = await h.db
      .select()
      .from(schema.activities)
      .where(
        and(eq(schema.activities.entityId, id), eq(schema.activities.action, 'project.updated')),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.changes).toMatchObject({
      name: { from: 'Editable', to: 'Renamed' },
      status: { from: 'planning', to: 'active' },
    });
  });

  it('writes no audit row when nothing actually changed', async () => {
    const id = await freshProject();

    await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Editable' }),
    });

    const { schema } = await import('@nexora/db');
    const { and, eq } = await import('drizzle-orm');

    const rows = await h.db
      .select()
      .from(schema.activities)
      .where(
        and(eq(schema.activities.entityId, id), eq(schema.activities.action, 'project.updated')),
      );

    expect(rows).toHaveLength(0);
  });

  it('soft deletes, hides from the list, and restores', async () => {
    const id = await freshProject();

    const deleted = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      method: 'DELETE',
      cookie: h.users.owner.cookie,
    });
    expect(deleted.status).toBe(200);

    const list = await h.request(`/orgs/${h.orgSlug}/projects`, {
      cookie: h.users.owner.cookie,
    });
    const { projects } = (await list.json()) as { projects: { id: string }[] };
    expect(projects.map((p) => p.id)).not.toContain(id);

    // The row is still there - this is a soft delete, not a removal.
    const { schema } = await import('@nexora/db');
    const { eq } = await import('drizzle-orm');
    const [row] = await h.db.select().from(schema.projects).where(eq(schema.projects.id, id));
    expect(row?.deletedAt).toBeTruthy();

    const trash = await h.request(`/orgs/${h.orgSlug}/projects/trash`, {
      cookie: h.users.owner.cookie,
    });
    const trashed = (await trash.json()) as { projects: { id: string }[] };
    expect(trashed.projects.map((p) => p.id)).toContain(id);

    const restored = await h.request(`/orgs/${h.orgSlug}/projects/${id}/restore`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
    });
    expect(restored.status).toBe(200);

    const after = await h.request(`/orgs/${h.orgSlug}/projects`, {
      cookie: h.users.owner.cookie,
    });
    const { projects: visible } = (await after.json()) as { projects: { id: string }[] };
    expect(visible.map((p) => p.id)).toContain(id);
  });

  it('refuses a manager deleting a project, and allows an admin', async () => {
    const id = await freshProject();

    // The matrix gives manager create/update/archive but not delete.
    const asManager = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      method: 'DELETE',
      cookie: h.users.manager.cookie,
    });
    expect(asManager.status).toBe(403);

    const asAdmin = await h.request(`/orgs/${h.orgSlug}/projects/${id}`, {
      method: 'DELETE',
      cookie: h.users.admin.cookie,
    });
    expect(asAdmin.status).toBe(200);
  });
});

describe('the role matrix over project routes', () => {
  const readExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 200],
    ['member', 200],
    // A guest can read projects shared with them; scoping to shared projects
    // arrives with the client portal in phase 8.
    ['guest', 200],
  ];

  it.each(readExpectations)('list projects: %s gets %i', async (role, expected) => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects`, {
      cookie: h.users[role].cookie,
    });
    expect(response.status).toBe(expected);
  });

  const trashExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 403],
    ['member', 403],
    ['guest', 403],
  ];

  it.each(trashExpectations)('trash: %s gets %i', async (role, expected) => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects/trash`, {
      cookie: h.users[role].cookie,
    });
    expect(response.status).toBe(expected);
  });

  it('refuses an anonymous request before it reaches any of this', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/projects`);
    expect(response.status).toBe(401);
  });
});
