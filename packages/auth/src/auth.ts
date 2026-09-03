import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin as adminPlugin, magicLink, organization, twoFactor } from 'better-auth/plugins';
// In Better Auth 1.7 passkey and apiKey ship as their own packages rather than
// from `better-auth/plugins`; sso and stripe likewise, and land in phases 8-9.
import { apiKey } from '@better-auth/api-key';
import { passkey } from '@better-auth/passkey';
import { uuidv7 } from 'uuidv7';
import { schema, type AnyDatabase } from '@nexora/db';
import { ORG_ROLES } from '@nexora/shared';
import { ac, admin, guest, manager, member, owner } from './permissions.js';

/**
 * Better Auth, built as a factory.
 *
 * `packages/auth` never reads `process.env` - secrets live in `apps/api/.env`
 * and reach here as arguments (CLAUDE.md). That also means the same
 * configuration can be constructed against the PGlite test database, which is
 * how the auth tests run without a Neon branch.
 */

export interface AuthEmail {
  to: string;
  subject: string;
  /** Rendered by `@nexora/email`; plain text here keeps this package UI-free. */
  text: string;
  url?: string;
}

export interface AuthConfig {
  database: AnyDatabase;
  /** BETTER_AUTH_SECRET - at least 32 characters. */
  secret: string;
  /** Public URL of the API, where /api/auth/* is mounted. */
  baseURL: string;
  /** Origins allowed to hold a session cookie, i.e. the web app. */
  trustedOrigins: string[];
  /** `.example.com` in production so app. and api. share the cookie; unset locally. */
  cookieDomain?: string | undefined;
  /** Delivers verification, reset, invitation and magic-link mail. */
  sendEmail: (email: AuthEmail) => Promise<void>;
  socialProviders?: {
    google?: { clientId: string; clientSecret: string };
    github?: { clientId: string; clientSecret: string };
    microsoft?: { clientId: string; clientSecret: string };
  };
  /** Test builds skip rate limiting so the suite is not throttled. */
  disableRateLimit?: boolean;
}

export function createAuth(config: AuthConfig) {
  const isCrossSubdomain = Boolean(config.cookieDomain);

  return betterAuth({
    appName: 'Nexora',
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    trustedOrigins: config.trustedOrigins,

    database: drizzleAdapter(config.database, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        team: schema.team,
        teamMember: schema.teamMember,
        twoFactor: schema.twoFactor,
        passkey: schema.passkey,
        apikey: schema.apikey,
        ssoProvider: schema.ssoProvider,
        subscription: schema.subscription,
      },
      usePlural: false,
    }),

    advanced: {
      database: {
        // Matches the uuid primary keys in packages/db. Without this Better
        // Auth mints its own text ids and every insert fails on the uuid cast.
        generateId: () => uuidv7(),
      },
      cookiePrefix: 'nexora',
      crossSubDomainCookies: isCrossSubdomain
        ? { enabled: true, domain: config.cookieDomain as string }
        : { enabled: false },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        // The web app and the API are separate origins, so the cookie must
        // survive a cross-origin fetch. Secure is required for that off
        // localhost, which is why production needs both apps on one domain.
        secure: config.baseURL.startsWith('https://'),
      },
    },

    emailAndPassword: {
      enabled: true,
      // Better Auth's default hasher is scrypt.
      minPasswordLength: 12,
      requireEmailVerification: true,
      // The legacy `changeUserPassword` never checked the current password, so
      // a stolen cookie was a permanent account takeover.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await config.sendEmail({
          to: user.email,
          subject: 'Reset your Nexora password',
          text: `Reset your password: ${url}`,
          url,
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await config.sendEmail({
          to: user.email,
          subject: 'Verify your email',
          text: `Confirm your address: ${url}`,
          url,
        });
      },
    },

    socialProviders: {
      ...(config.socialProviders?.google ? { google: config.socialProviders.google } : {}),
      ...(config.socialProviders?.github ? { github: config.socialProviders.github } : {}),
      ...(config.socialProviders?.microsoft ? { microsoft: config.socialProviders.microsoft } : {}),
    },

    user: {
      additionalFields: {
        jobTitle: { type: 'string', required: false, input: true },
        timezone: { type: 'string', required: false, defaultValue: 'UTC', input: true },
        locale: { type: 'string', required: false, defaultValue: 'en', input: true },
        // Never `input: true` - a client that can set these owns the account.
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
        lastSeenAt: { type: 'date', required: false, input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      /**
       * Cookie cache is DISABLED deliberately.
       *
       * It signs the session into the cookie and skips the database read, which
       * is faster - but a revoked session keeps working until the cache
       * expires. M1 requires "revoke one or all" and `isActive`/ban enforced on
       * *every* request, and a five-minute window where a revoked session still
       * works is not that. One indexed read per request is the price.
       *
       * Proven by "signs out and invalidates the session row" in tests/auth.test.ts,
       * which fails with the cache on.
       */
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: !config.disableRateLimit,
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/forget-password': { window: 60, max: 3 },
      },
    },

    plugins: [
      organization({
        ac,
        roles: { owner, admin, manager, member, guest },
        teams: { enabled: true, maximumTeams: 50 },
        creatorRole: 'owner',
        membershipLimit: 500,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        sendInvitationEmail: async (data) => {
          const url = `${config.trustedOrigins[0]}/accept-invite?id=${data.id}`;
          await config.sendEmail({
            to: data.email,
            subject: `${data.organization.name} invited you to Nexora`,
            text: `${data.inviter.user.name} invited you to join ${data.organization.name}: ${url}`,
            url,
          });
        },
      }),
      // Platform-level roles, distinct from the org roles in permissions.ts.
      // `user.role` here answers "can this person administer the Nexora
      // instance", not "what can they do inside an organization".
      adminPlugin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
      twoFactor({
        issuer: 'Nexora',
        otpOptions: {
          sendOTP: async ({ user, otp }) => {
            await config.sendEmail({
              to: user.email,
              subject: 'Your Nexora sign-in code',
              text: `Your code is ${otp}. It expires in 3 minutes.`,
            });
          },
        },
      }),
      passkey({ rpName: 'Nexora' }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendEmail({
            to: email,
            subject: 'Your Nexora sign-in link',
            text: `Sign in: ${url}`,
            url,
          });
        },
      }),
      apiKey({
        defaultPrefix: 'nx_',
        enableMetadata: true,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];

/** The org roles Better Auth knows about, kept in step with the shared list. */
export const AUTH_ORG_ROLES = ORG_ROLES;
