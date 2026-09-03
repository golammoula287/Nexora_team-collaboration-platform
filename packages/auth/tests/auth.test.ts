import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '@nexora/db/schema';
import { isUuid } from '@nexora/db';
import {
  authRequest,
  cookiesFrom,
  createAuthHarness,
  type AuthHarness,
} from './helpers/harness.js';

/**
 * These run the real Better Auth against the real migrations. Their first job
 * is to prove the hand-written auth tables are correct; their second is to close
 * the holes the legacy app shipped with.
 */

let h: AuthHarness;

beforeAll(async () => {
  h = await createAuthHarness();
});

afterAll(async () => {
  await h?.close();
});

const password = 'correct-horse-battery-staple';

async function signUp(email: string, name = 'Test User') {
  const response = await h.auth.handler(
    authRequest('/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  );
  return response;
}

async function signIn(email: string, pw = password) {
  return h.auth.handler(
    authRequest('/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password: pw }),
    }),
  );
}

async function verifyEmail(email: string) {
  const url = h.lastLinkTo(email);
  if (!url) throw new Error(`no verification link was sent to ${email}`);
  return h.auth.handler(new Request(url, { headers: { origin: 'http://localhost:3000' } }));
}

describe('schema compatibility', () => {
  it('signs a user up against the hand-written tables', async () => {
    const response = await signUp('ada@example.test', 'Ada Lovelace');
    expect(response.status).toBe(200);

    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'ada@example.test'));
    expect(row?.name).toBe('Ada Lovelace');
  });

  it('generates uuid v7 ids, matching the uuid primary keys', async () => {
    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'ada@example.test'));

    expect(row && isUuid(row.id)).toBe(true);
    // Version nibble: v7 ids have '7' at position 14.
    expect(row?.id[14]).toBe('7');
  });

  it('stores a scrypt hash, never the password', async () => {
    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'ada@example.test'));
    const [credential] = await h.db
      .select()
      .from(s.account)
      .where(eq(s.account.userId, row?.id ?? ''));

    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toContain(password);
  });

  it('sends a verification email on sign-up', () => {
    expect(h.lastLinkTo('ada@example.test')).toBeTruthy();
  });
});

describe('sign-in', () => {
  it('refuses an unverified account', async () => {
    const response = await signIn('ada@example.test');
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('succeeds once verified, and issues a session cookie', async () => {
    await verifyEmail('ada@example.test');

    const response = await signIn('ada@example.test');
    expect(response.status).toBe(200);

    const cookies = cookiesFrom(response);
    expect(cookies).toContain('nexora');

    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'ada@example.test'));
    const sessions = await h.db
      .select()
      .from(s.session)
      .where(eq(s.session.userId, row?.id ?? ''));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('refuses a wrong password', async () => {
    const response = await signIn('ada@example.test', 'not-the-password-at-all');
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('resolves the session from the cookie', async () => {
    const signedIn = await signIn('ada@example.test');
    const cookie = cookiesFrom(signedIn);

    const response = await h.auth.handler(authRequest('/get-session', { cookie }));
    const body = (await response.json()) as { user?: { email?: string } } | null;

    expect(body?.user?.email).toBe('ada@example.test');
  });
});

describe('privilege escalation - the legacy hole', () => {
  /**
   * The legacy `registerUser` passed `isAdmin` straight from the request body
   * into `User.create`, so anyone could self-promote by adding one field to a
   * signup payload. These assert that shape of attack is now inert.
   */

  it('never lets a signup body set the platform role', async () => {
    const response = await h.auth.handler(
      authRequest('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'attacker@example.test',
          password,
          name: 'Attacker',
          role: 'admin',
        }),
      }),
    );

    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'attacker@example.test'));

    // Better Auth 1.7 rejects the request outright rather than stripping the
    // field. Either outcome is acceptable; becoming an admin is not. Asserting
    // the property rather than the status code keeps this test honest if the
    // library later chooses to ignore instead of reject.
    if (response.status === 200) {
      expect(row?.role).not.toBe('admin');
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(row).toBeUndefined();
    }
  });

  it('ignores isActive and banned sent in the signup body', async () => {
    await h.auth.handler(
      authRequest('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'sneaky@example.test',
          password,
          name: 'Sneaky',
          isActive: false,
          banned: true,
          emailVerified: true,
        }),
      }),
    );

    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'sneaky@example.test'));

    // Defaults win over anything the client asked for.
    expect(row?.isActive).toBe(true);
    expect(row?.banned).toBe(false);
    // The important one: a client cannot mark its own address verified.
    expect(row?.emailVerified).toBe(false);
  });

  it('ignores an id sent in the signup body', async () => {
    const planted = '00000000-0000-7000-8000-000000000001';
    await h.auth.handler(
      authRequest('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'planted@example.test',
          password,
          name: 'Planted',
          id: planted,
        }),
      }),
    );

    const [row] = await h.db.select().from(s.user).where(eq(s.user.email, 'planted@example.test'));
    expect(row?.id).not.toBe(planted);
  });
});

describe('password change - the other legacy hole', () => {
  it('requires the current password', async () => {
    // The legacy `changeUserPassword` never checked it, so a stolen cookie was
    // a permanent account takeover.
    const signedIn = await signIn('ada@example.test');
    const cookie = cookiesFrom(signedIn);

    const response = await h.auth.handler(
      authRequest('/change-password', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          newPassword: 'a-brand-new-password-here',
          currentPassword: 'wrong-current-password',
        }),
      }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('succeeds with the current password, and can revoke other sessions', async () => {
    const signedIn = await signIn('ada@example.test');
    const cookie = cookiesFrom(signedIn);

    const response = await h.auth.handler(
      authRequest('/change-password', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          newPassword: 'a-brand-new-password-here',
          currentPassword: password,
          revokeOtherSessions: true,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const after = await signIn('ada@example.test', 'a-brand-new-password-here');
    expect(after.status).toBe(200);
  });
});

describe('session lifecycle', () => {
  it('signs out and invalidates the session row', async () => {
    const signedIn = await signIn('ada@example.test', 'a-brand-new-password-here');
    const cookie = cookiesFrom(signedIn);

    const before = await h.auth.handler(authRequest('/get-session', { cookie }));
    expect(((await before.json()) as { user?: unknown } | null)?.user).toBeTruthy();

    await h.auth.handler(authRequest('/sign-out', { method: 'POST', cookie }));

    const after = await h.auth.handler(authRequest('/get-session', { cookie }));
    const body = (await after.json()) as { user?: unknown } | null;
    expect(body?.user).toBeFalsy();
  });

  it("lists a user's active sessions so devices can be reviewed", async () => {
    const signedIn = await signIn('ada@example.test', 'a-brand-new-password-here');
    const cookie = cookiesFrom(signedIn);

    const response = await h.auth.handler(authRequest('/list-sessions', { cookie }));
    expect(response.status).toBe(200);

    const sessions = (await response.json()) as unknown[];
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
  });
});
