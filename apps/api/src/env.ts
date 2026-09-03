import { config } from 'dotenv';
import { z } from 'zod';

config();

/**
 * The one place in the backend that reads process.env. Everything else imports
 * `env` from here, so a missing variable is a startup failure with a readable
 * message rather than an `undefined` that surfaces three layers deep in production.
 *
 * Variables land here as they become required, phase by phase. Anything a later
 * phase needs is optional until that phase makes it required.
 */
const schema = z.object({
  // --- Server -------------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of origins allowed to send credentialed requests. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  API_URL: z.url().default('http://localhost:4000'),
  WEB_URL: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // --- Phase 1: database --------------------------------------------------
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),

  // --- Phase 2: auth ------------------------------------------------------
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),

  // --- Phase 5: files, realtime, jobs -------------------------------------
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  LIVEBLOCKS_SECRET_KEY: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // --- Phase 6: AI --------------------------------------------------------
  ANTHROPIC_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  AI_MONTHLY_CREDIT_USD: z.coerce.number().positive().optional(),

  // --- Phase 8: billing and integrations ----------------------------------
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  INBOUND_EMAIL_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().length(64).optional(),

  // --- Phase 9: rate limiting and observability ---------------------------
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

/**
 * A key left blank in .env arrives as an empty string, not as undefined, which
 * would fail every `.optional()` above and defeat every default. Drop the blanks
 * so "present but empty" and "absent" mean the same thing.
 */
const provided = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
);

const parsed = schema.safeParse(provided);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  console.error(['Invalid environment. Fix apps/api/.env, then restart:', ...lines].join('\n'));
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/** Origins allowed to send credentialed requests, parsed once at boot. */
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

/**
 * Assert that a variable a given feature depends on is present. Call this at the
 * point of use so a half-configured .env fails loudly in the one place it matters
 * rather than blocking the whole server from booting.
 */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing ${String(key)} in apps/api/.env - required for this feature.`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
