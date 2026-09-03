import { createAuth } from '@nexora/auth';
import { createDatabase } from '@nexora/db';
import { env, isProduction, requireEnv } from '../env.js';
import { sendEmail } from './email.js';
import type { Services } from '../services.js';

/**
 * Builds the real services from the environment.
 *
 * Called once at boot. Anything missing fails here with a readable message
 * rather than at the first request that happens to need it.
 */
export function createServices(): Services {
  const db = createDatabase(requireEnv('DATABASE_URL'));

  const auth = createAuth({
    database: db,
    secret: requireEnv('BETTER_AUTH_SECRET'),
    baseURL: env.BETTER_AUTH_URL ?? env.API_URL,
    trustedOrigins: [env.WEB_URL],
    cookieDomain: env.AUTH_COOKIE_DOMAIN,
    sendEmail,
    /*
     * Better Auth's limiter is in-memory and per-process, which is the wrong
     * shape for both ends of the range: it does nothing across instances in
     * production, and it blocks repeated end-to-end runs locally. Real rate
     * limiting is phase 9's job, backed by Upstash. Until then it stays on in
     * production and off everywhere else.
     */
    disableRateLimit: !isProduction,
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
            },
          }
        : {}),
    },
  });

  return { db, auth };
}

/** True when the API has enough configuration to serve authenticated routes. */
export function canServeAuth(): boolean {
  return Boolean(env.DATABASE_URL && env.BETTER_AUTH_SECRET);
}
