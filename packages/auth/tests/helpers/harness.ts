import { createTestDatabase, type TestDatabase } from '@nexora/db/testing';
import { createAuth, type Auth, type AuthEmail } from '../../src/auth.js';

/**
 * Auth against a real Postgres.
 *
 * `@better-auth/cli` is still on 1.4.x while the library is 1.7.2, so its
 * generated schema predates the plugin split and would be a misleading thing to
 * diff against. Instead these tests prove the hand-written tables in
 * `packages/db/src/schema/auth.ts` are correct the only way that really counts:
 * by running the library against them. A missing or mistyped column surfaces as
 * a failing sign-up, not as a passing diff.
 */

export interface AuthHarness {
  auth: Auth;
  db: TestDatabase['db'];
  /** Every email the auth layer tried to send, newest last. */
  outbox: AuthEmail[];
  /** The most recent link sent to `address`, or undefined. */
  lastLinkTo(address: string): string | undefined;
  close(): Promise<void>;
}

export const BASE_URL = 'http://localhost:4000';
export const WEB_URL = 'http://localhost:3000';

export async function createAuthHarness(): Promise<AuthHarness> {
  const harness = await createTestDatabase();
  const outbox: AuthEmail[] = [];

  const auth = createAuth({
    database: harness.db,
    secret: 'test-secret-that-is-comfortably-over-32-characters',
    baseURL: BASE_URL,
    trustedOrigins: [WEB_URL],
    // Otherwise the suite trips its own sign-in limiter.
    disableRateLimit: true,
    sendEmail: async (email) => {
      outbox.push(email);
    },
  });

  return {
    auth,
    db: harness.db,
    outbox,
    lastLinkTo(address) {
      for (let i = outbox.length - 1; i >= 0; i -= 1) {
        const email = outbox[i];
        if (email?.to === address && email.url) return email.url;
      }
      return undefined;
    },
    close: harness.close,
  };
}

/** Build a request the way the browser would, so the handler path is exercised. */
export function authRequest(path: string, init?: RequestInit & { cookie?: string }) {
  const headers = new Headers(init?.headers);
  headers.set('origin', WEB_URL);
  if (!headers.has('content-type') && init?.body) {
    headers.set('content-type', 'application/json');
  }
  if (init?.cookie) headers.set('cookie', init.cookie);

  return new Request(`${BASE_URL}/api/auth${path}`, { ...init, headers });
}

/** Collect Set-Cookie headers into something a follow-up request can send back. */
export function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
