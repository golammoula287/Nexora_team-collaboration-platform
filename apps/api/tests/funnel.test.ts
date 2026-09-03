import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrgRole } from '@nexora/shared';
import { createApiHarness, WEB_URL, type ApiHarness } from './helpers/app.js';

/**
 * THE AUTHORIZATION FUNNEL.
 *
 *   cors -> session -> org -> authorize -> handler
 *
 * Every one of these goes over real HTTP against a real database and a real
 * Better Auth. The legacy app had three routers with a `// @access Protected`
 * comment and no middleware at all; the point of these tests is that such a
 * claim can never again be made without evidence.
 */

let h: ApiHarness;

beforeAll(async () => {
  h = await createApiHarness();
});

afterAll(async () => {
  await h?.close();
});

describe('session gate', () => {
  it('rejects an anonymous request with 401', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}`);
    expect(response.status).toBe(401);
  });

  it('rejects a forged cookie', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}`, {
      cookie: 'nexora.session_token=not-a-real-token',
    });
    expect(response.status).toBe(401);
  });

  it('accepts a real session', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}`, { cookie: h.users.owner.cookie });
    expect(response.status).toBe(200);
  });

  it('returns the standard error shape, not a stack trace', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}`);
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('at ');
  });
});

describe('org gate', () => {
  it('gives a non-member 404, never 403', async () => {
    // A 403 would confirm the organization exists. Whether a slug is taken is
    // itself information an outsider is not entitled to.
    const response = await h.request(`/orgs/${h.orgSlug}`, { cookie: h.outsider.cookie });
    expect(response.status).toBe(404);
  });

  it('gives 404 for an organization that does not exist', async () => {
    const response = await h.request('/orgs/does-not-exist', { cookie: h.users.owner.cookie });
    expect(response.status).toBe(404);
  });

  it('derives the role from the database, never from the request', async () => {
    // The exact legacy hole: `isAdmin` read off the request body. Ask for
    // auditLog - which only owner and admin may read - while claiming to be one.
    const response = await h.request(`/orgs/${h.orgSlug}/audit-log`, {
      method: 'GET',
      cookie: h.users.member.cookie,
      headers: { 'x-role': 'owner' },
    });

    expect(response.status).toBe(403);
  });

  it('refuses a guest the audit log regardless of what they claim', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/audit-log`, {
      method: 'GET',
      cookie: h.users.guest.cookie,
      headers: { 'x-organization-id': 'anything', 'x-is-admin': 'true' },
    });

    expect(response.status).toBe(403);
  });
});

describe('authorize gate - the role matrix over real routes', () => {
  /** [role, expected status] for GET /orgs/:slug/audit-log (owner + admin only). */
  const auditLogExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 403],
    ['member', 403],
    ['guest', 403],
  ];

  it.each(auditLogExpectations)('audit log: %s gets %i', async (role, expected) => {
    const response = await h.request(`/orgs/${h.orgSlug}/audit-log`, {
      cookie: h.users[role].cookie,
    });
    expect(response.status).toBe(expected);
  });

  /** GET /orgs/:slug/members needs member.read, which the guest lacks. */
  const memberListExpectations: [OrgRole, number][] = [
    ['owner', 200],
    ['admin', 200],
    ['manager', 200],
    ['member', 200],
    ['guest', 403],
  ];

  it.each(memberListExpectations)('member list: %s gets %i', async (role, expected) => {
    const response = await h.request(`/orgs/${h.orgSlug}/members`, {
      cookie: h.users[role].cookie,
    });
    expect(response.status).toBe(expected);
  });

  it('explains the refusal without leaking the resource', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/audit-log`, {
      cookie: h.users.member.cookie,
    });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('member');
  });
});

describe('handler scoping', () => {
  it("returns only the caller's organizations from /me", async () => {
    const response = await h.request('/me', { cookie: h.users.member.cookie });
    const body = (await response.json()) as {
      organizations: { slug: string; role: string }[];
    };

    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0]?.slug).toBe(h.orgSlug);
    expect(body.organizations[0]?.role).toBe('member');
  });

  it('returns nothing for a user in no organization', async () => {
    const response = await h.request('/me', { cookie: h.outsider.cookie });
    const body = (await response.json()) as { organizations: unknown[] };

    expect(body.organizations).toEqual([]);
  });

  it("scopes the member list to the caller's org", async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/members`, {
      cookie: h.users.admin.cookie,
    });
    const body = (await response.json()) as { members: { user: { email: string } }[] };

    // Seven accounts exist; only the six members of this org are visible
    // (one per role, plus the second admin).
    expect(body.members).toHaveLength(6);
    expect(body.members.map((m) => m.user.email)).not.toContain('outsider@example.test');
  });
});

describe('cors', () => {
  it('allows the configured web origin with credentials', async () => {
    const response = await h.request('/health');
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB_URL);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('does not echo an unknown origin', async () => {
    const response = await h.app.request(
      new Request('http://localhost:4000/health', {
        headers: { origin: 'http://evil.test' },
      }),
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('deactivated accounts', () => {
  it('refuses a signed-in user whose account has been deactivated', async () => {
    // Enforced on every request rather than cached into the cookie - which is
    // why session.cookieCache is off.
    const { schema } = await import('@nexora/db');
    const { eq } = await import('drizzle-orm');

    await h.db
      .update(schema.user)
      .set({ isActive: false })
      .where(eq(schema.user.id, h.users.manager.id));

    const response = await h.request(`/orgs/${h.orgSlug}`, { cookie: h.users.manager.cookie });
    expect(response.status).toBe(403);

    await h.db
      .update(schema.user)
      .set({ isActive: true })
      .where(eq(schema.user.id, h.users.manager.id));
  });

  it('refuses a banned user immediately', async () => {
    const { schema } = await import('@nexora/db');
    const { eq } = await import('drizzle-orm');

    await h.db
      .update(schema.user)
      .set({ banned: true })
      .where(eq(schema.user.id, h.users.member.id));

    const response = await h.request(`/orgs/${h.orgSlug}`, { cookie: h.users.member.cookie });
    expect(response.status).toBe(403);

    await h.db
      .update(schema.user)
      .set({ banned: false })
      .where(eq(schema.user.id, h.users.member.id));
  });
});

describe('membership changes', () => {
  /** The member row id for a given role in the fixture organization. */
  async function memberIdFor(role: OrgRole): Promise<string> {
    const { schema } = await import('@nexora/db');
    const { and, eq } = await import('drizzle-orm');

    const [row] = await h.db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, h.organizationId),
          eq(schema.member.userId, h.users[role].id),
        ),
      );

    return row?.id ?? '';
  }

  async function setRole(actor: OrgRole, targetMemberId: string, role: OrgRole) {
    return h.request(`/orgs/${h.orgSlug}/members/${targetMemberId}/role`, {
      method: 'PATCH',
      cookie: h.users[actor].cookie,
      body: JSON.stringify({ role }),
    });
  }

  it('lets an owner promote a member', async () => {
    const id = await memberIdFor('member');
    const response = await setRole('owner', id, 'manager');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: 'manager' });

    // Put it back so later tests see the fixture as declared.
    await setRole('owner', id, 'member');
  });

  it('refuses a peer demoting a peer', async () => {
    // The escalation that matters: one admin demoting another and taking sole
    // control. Better Auth's own updateMemberRole would allow this, which is
    // why these routes exist. Uses the second admin - demoting yourself is
    // refused for a different reason and would not prove the rule.
    const { schema } = await import('@nexora/db');
    const { and, eq } = await import('drizzle-orm');

    const [peer] = await h.db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, h.organizationId),
          eq(schema.member.userId, h.peerAdmin.id),
        ),
      );

    const response = await setRole('admin', peer?.id ?? '', 'member');
    expect(response.status).toBe(403);
  });

  it('refuses an admin touching an owner', async () => {
    const id = await memberIdFor('owner');
    const response = await setRole('admin', id, 'member');

    expect(response.status).toBe(403);
  });

  it('refuses granting a role above the actor', async () => {
    const id = await memberIdFor('member');
    const response = await setRole('admin', id, 'owner');

    expect(response.status).toBe(403);
  });

  it('refuses a member changing anyone', async () => {
    const id = await memberIdFor('guest');
    const response = await setRole('member', id, 'admin');

    expect(response.status).toBe(403);
  });

  it('refuses changing your own role', async () => {
    const id = await memberIdFor('owner');
    const response = await setRole('owner', id, 'admin');

    expect(response.status).toBe(400);
  });

  it('gives 404 for a member id from another organization', async () => {
    const { schema } = await import('@nexora/db');
    const { newId } = await import('@nexora/db');

    const otherOrgId = newId();
    await h.db
      .insert(schema.organization)
      .values({ id: otherOrgId, name: 'Other', slug: `other-${otherOrgId.slice(0, 8)}` });

    const outsiderMemberId = newId();
    await h.db.insert(schema.member).values({
      id: outsiderMemberId,
      organizationId: otherOrgId,
      userId: h.outsider.id,
      role: 'member',
    });

    // A valid member id, but belonging to a different tenant.
    const response = await setRole('owner', outsiderMemberId, 'admin');
    expect(response.status).toBe(404);
  });

  it('writes an audit row for a role change', async () => {
    const { schema } = await import('@nexora/db');
    const { and, eq } = await import('drizzle-orm');

    const id = await memberIdFor('member');
    await setRole('owner', id, 'manager');

    const rows = await h.db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.organizationId, h.organizationId),
          eq(schema.activities.action, 'member.role_changed'),
        ),
      );

    expect(rows.length).toBeGreaterThan(0);
    const latest = rows[rows.length - 1];
    expect(latest?.actorId).toBe(h.users.owner.id);
    expect(latest?.changes).toMatchObject({ role: { to: 'manager' } });

    await setRole('owner', id, 'member');
  });

  it('rejects an unknown role with 400, not 500', async () => {
    const id = await memberIdFor('member');
    const response = await h.request(`/orgs/${h.orgSlug}/members/${id}/role`, {
      method: 'PATCH',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ role: 'superuser' }),
    });

    expect(response.status).toBe(400);
  });
});
