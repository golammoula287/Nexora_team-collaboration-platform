import { apiKeyClient } from '@better-auth/api-key/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  inferAdditionalFields,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins';
import { ac, roles } from '@nexora/shared';
import { API_URL } from './env';

/**
 * Better Auth's browser client, pointed at the API on its own origin.
 *
 * `credentials: 'include'` is what makes the session cookie cross the origin
 * boundary; the API's CORS_ORIGIN must list this app for it to be accepted.
 *
 * The client plugin list must mirror the server's in `packages/auth/src/auth.ts`
 * or the typed methods here will not match the routes that exist.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
  plugins: [
    // The same access-control definition the server uses, so the client
    // knows our roles (manager, guest) rather than Better Auth defaults.
    organizationClient({ ac, roles }),
    adminClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    apiKeyClient(),
    // Keeps the extra user columns (jobTitle, timezone, locale) typed on the
    // client without redeclaring them.
    inferAdditionalFields({
      user: {
        jobTitle: { type: 'string', required: false },
        timezone: { type: 'string', required: false },
        locale: { type: 'string', required: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession, organization, twoFactor, passkey, admin } =
  authClient;

export type Session = typeof authClient.$Infer.Session;
