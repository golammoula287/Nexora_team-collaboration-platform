#!/usr/bin/env node
/**
 * pnpm env:check
 *
 * Reads apps/api/.env and apps/web/.env, says exactly what is configured and
 * what is missing, then actually connects to the database rather than just
 * checking that a string is present. A DATABASE_URL that is set but wrong is
 * the failure mode worth catching here.
 *
 * Exits non-zero only when something REQUIRED is wrong, so it is safe in CI.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const c = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  green: '[32m',
  red: '[31m',
  yellow: '[33m',
  blue: '[36m',
};

const ok = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const bad = (m) => console.log(`  ${c.red}✗${c.reset} ${m}`);
const warn = (m) => console.log(`  ${c.yellow}○${c.reset} ${m}`);
const note = (m) => console.log(`    ${c.dim}${m}${c.reset}`);
const head = (m) => console.log(`\n${c.bold}${m}${c.reset}`);

/** Minimal .env parser - no dependency, and it only needs to handle our format. */
function readEnv(relative) {
  const path = join(root, relative);
  if (!existsSync(path)) return null;

  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) out[key] = value;
  }
  return out;
}

let failures = 0;
let migrationsApplied = false;

console.log(`${c.bold}Nexora environment check${c.reset}`);

// --- files ------------------------------------------------------------------
head('Files');

const api = readEnv('apps/api/.env');
const web = readEnv('apps/web/.env');

if (api) ok('apps/api/.env exists');
else {
  bad('apps/api/.env is missing');
  note('cp apps/api/.env.example apps/api/.env');
  failures++;
}

if (web) ok('apps/web/.env exists');
else {
  bad('apps/web/.env is missing');
  note('cp apps/web/.env.example apps/web/.env');
  failures++;
}

if (!api || !web) {
  console.log(`\n${c.red}Create the env files first, then run this again.${c.reset}\n`);
  process.exit(1);
}

// --- required ---------------------------------------------------------------
head('Required to proceed');

if (api.DATABASE_URL) {
  ok('DATABASE_URL is set');
  if (!api.DATABASE_URL.includes('-pooler')) {
    warn('DATABASE_URL does not contain "-pooler" - is this the pooled string?');
    note('The app should use the pooled host; migrations use the unpooled one.');
  }
} else {
  bad('DATABASE_URL is empty');
  note('Neon dashboard -> Connect -> copy the pooled connection string');
  failures++;
}

if (api.DATABASE_URL_UNPOOLED) {
  ok('DATABASE_URL_UNPOOLED is set');
  if (api.DATABASE_URL_UNPOOLED.includes('-pooler')) {
    bad('DATABASE_URL_UNPOOLED still contains "-pooler"');
    note('Remove "-pooler" from the host. drizzle-kit cannot run DDL through the pooler.');
    failures++;
  }
} else {
  bad('DATABASE_URL_UNPOOLED is empty');
  note('Same string as DATABASE_URL with "-pooler" removed from the host');
  failures++;
}

if (!api.BETTER_AUTH_SECRET) {
  bad('BETTER_AUTH_SECRET is empty');
  note('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  failures++;
} else if (api.BETTER_AUTH_SECRET.length < 32) {
  bad(`BETTER_AUTH_SECRET is only ${api.BETTER_AUTH_SECRET.length} characters, needs 32+`);
  failures++;
} else {
  ok('BETTER_AUTH_SECRET is set and long enough');
}

// --- wiring -----------------------------------------------------------------
head('Wiring between the two apps');

const corsOrigins = (api.CORS_ORIGIN ?? '').split(',').map((o) => o.trim().replace(/\/$/, ''));
const webOrigin = (web.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

if (webOrigin && corsOrigins.includes(webOrigin)) {
  ok(`API allows the web origin (${webOrigin})`);
} else {
  bad(`CORS_ORIGIN (${api.CORS_ORIGIN}) does not include the web app (${webOrigin})`);
  note('Every browser request would fail CORS.');
  failures++;
}

const apiUrl = (api.API_URL ?? '').replace(/\/$/, '');
const webApiUrl = (web.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

if (apiUrl && apiUrl === webApiUrl) ok(`web points at the API (${webApiUrl})`);
else {
  bad(`NEXT_PUBLIC_API_URL (${webApiUrl}) does not match the API's API_URL (${apiUrl})`);
  failures++;
}

if (api.AUTH_COOKIE_DOMAIN && apiUrl.includes('localhost')) {
  bad('AUTH_COOKIE_DOMAIN is set while running on localhost');
  note('That breaks the session cookie locally. Leave it blank until production.');
  failures++;
}

// --- secrets in the browser bundle ------------------------------------------
head('Secret leakage');

const leaked = Object.keys(web).filter(
  (k) => k.startsWith('NEXT_PUBLIC_') && /SECRET|PRIVATE|PASSWORD|_TOKEN$/i.test(k),
);
if (leaked.length === 0) ok('no secret-looking NEXT_PUBLIC_* variables');
else {
  for (const key of leaked) bad(`${key} would be compiled into the browser bundle`);
  failures++;
}

const shared = Object.entries(api).filter(
  ([k, v]) => /KEY|SECRET|PASSWORD/i.test(k) && Object.values(web).includes(v),
);
if (shared.length > 0) {
  for (const [key] of shared) bad(`${key} from the API also appears in apps/web/.env`);
  failures++;
}

// --- optional, by phase ------------------------------------------------------
head('Optional (blank is fine)');

const optional = [
  ['RESEND_API_KEY', 'phase 2', 'emails print to the API console instead of sending'],
  ['GOOGLE_CLIENT_ID', 'phase 2', 'Google sign-in unavailable'],
  ['GITHUB_CLIENT_ID', 'phase 2', 'GitHub sign-in unavailable'],
  ['R2_ACCOUNT_ID', 'phase 5', 'file uploads unavailable'],
  ['LIVEBLOCKS_SECRET_KEY', 'phase 5', 'realtime unavailable'],
  ['INNGEST_EVENT_KEY', 'phase 5', 'background jobs unavailable'],
  ['ANTHROPIC_API_KEY', 'phase 6', 'AI unavailable'],
  ['VOYAGE_API_KEY', 'phase 6', 'embeddings unavailable'],
  ['STRIPE_SECRET_KEY', 'phase 8', 'billing unavailable'],
];

for (const [key, phase, consequence] of optional) {
  if (api[key]) ok(`${key} ${c.dim}(${phase})${c.reset}`);
  else warn(`${key} not set ${c.dim}(${phase}) - ${consequence}${c.reset}`);
}

// --- live connection ---------------------------------------------------------
head('Database connection');

if (!api.DATABASE_URL) {
  warn('skipped - DATABASE_URL is empty');
} else {
  // Run in a child process; see the note at the top of scripts/db-check.mjs.
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'db-check.mjs'), api.DATABASE_URL],
    { encoding: 'utf8', timeout: 30_000 },
  );

  const lines = (result.stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));

  if (lines.length === 0) {
    bad('database check produced no output');
    note((result.stderr ?? '').trim().split('\n')[0] ?? 'unknown failure');
    failures++;
  }

  migrationsApplied = lines.some(([k, m]) => k === 'ok' && m.startsWith('migrations applied'));

  for (const [kind, message] of lines) {
    if (kind === 'ok') ok(message);
    else if (kind === 'warn') warn(message);
    else if (kind === 'note') note(message);
    else if (kind === 'bad') {
      bad(message);
      failures++;
    }
  }
}

// --- verdict -----------------------------------------------------------------
console.log('');
if (failures === 0) {
  console.log(
    migrationsApplied
      ? `${c.green}${c.bold}Ready.${c.reset} Next: ${c.blue}pnpm dev${c.reset}\n`
      : `${c.green}${c.bold}Ready.${c.reset} Next: ${c.blue}pnpm db:migrate && pnpm db:seed${c.reset}, then ${c.blue}pnpm dev${c.reset}\n`,
  );
  process.exit(0);
}

console.log(`${c.red}${c.bold}${failures} problem${failures === 1 ? '' : 's'} to fix.${c.reset}`);
console.log(`${c.dim}Details are in apps/api/.env.example.${c.reset}\n`);
process.exit(1);
