import { createAuth } from '@nexora/auth';
import { createTestDatabase, type TestDatabase } from '@nexora/db/testing';
import { newId, schema } from '@nexora/db';
import type { OrgRole } from '@nexora/shared';
import { createApp } from '../../src/app.js';

/**
 * The whole API, built against a real Postgres and a real Better Auth.
 *
 * `createApp(services)` takes its dependencies as an argument precisely so this
 * is possible: the middleware chain that decides who may do what is the part
 * most worth testing, and it is tested here through actual HTTP requests rather
 * than by calling the middleware functions directly.
 */

export const WEB_URL = 'http://localhost:3000';
export const API_URL = 'http://localhost:4000';

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
  role: OrgRole;
}

export interface ApiHarness {
  app: ReturnType<typeof createApp>;
  db: TestDatabase['db'];
  orgSlug: string;
  organizationId: string;
  /** One signed-in user per org role, plus an outsider who belongs to no org. */
  users: Record<OrgRole, TestUser>;
  outsider: TestUser;
  request(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>;
  close(): Promise<void>;
}

const PASSWORD = 'correct-horse-battery-staple';

export async function createApiHarness(): Promise<ApiHarness> {
  const harness = await createTestDatabase();
  const outbox: { to: string; url?: string }[] = [];

  const auth = createAuth({
    database: harness.db,
    secret: 'test-secret-that-is-comfortably-over-32-characters',
    baseURL: API_URL,
    trustedOrigins: [WEB_URL],
    disableRateLimit: true,
    sendEmail: async (email) => {
      outbox.push({ to: email.to, ...(email.url ? { url: email.url } : {}) });
    },
  });

  const app = createApp({ db: harness.db, auth });

  const request = async (path: string, init?: RequestInit & { cookie?: string }) => {
    const headers = new Headers(init?.headers);
    headers.set('origin', WEB_URL);
    if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
    if (init?.cookie) headers.set('cookie', init.cookie);
    return app.request(new Request(`${API_URL}${path}`, { ...init, headers }));
  };

  /** Sign up, verify, sign in - and hand back the session cookie. */
  async function makeUser(email: string, name: string): Promise<Omit<TestUser, 'role'>> {
    await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD, name }),
    });

    const link = [...outbox].reverse().find((e) => e.to === email)?.url;
    if (link) await app.request(new Request(link, { headers: { origin: WEB_URL } }));

    const signedIn = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD }),
    });

    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    const [row] = await harness.db.query.user.findMany({
      where: (u, { eq }) => eq(u.email, email),
      limit: 1,
    });

    return { id: row?.id ?? '', email, cookie };
  }

  // One organization, one member per role. Membership rows are written
  // directly: this fixture is testing the API's authorization, not Better
  // Auth's invitation flow, which has its own tests.
  const organizationId = newId();
  const orgSlug = 'northwind';

  await harness.db.insert(schema.organization).values({
    id: organizationId,
    name: 'Northwind Studio',
    slug: orgSlug,
  });

  const roleList: OrgRole[] = ['owner', 'admin', 'manager', 'member', 'guest'];
  const users = {} as Record<OrgRole, TestUser>;

  for (const role of roleList) {
    const base = await makeUser(`${role}@example.test`, `${role} user`);
    await harness.db.insert(schema.member).values({
      organizationId,
      userId: base.id,
      role,
    });
    users[role] = { ...base, role };
  }

  // Belongs to no organization: used to prove a non-member gets 404, not 403.
  const outsiderBase = await makeUser('outsider@example.test', 'Outsider');
  const outsider: TestUser = { ...outsiderBase, role: 'member' };

  return {
    app,
    db: harness.db,
    orgSlug,
    organizationId,
    users,
    outsider,
    request,
    close: harness.close,
  };
}
