/**
 * Public configuration for the frontend.
 *
 * Anything read here is compiled into the browser bundle, so nothing secret may
 * ever appear in this file. Secrets live in apps/api/.env and are reachable only
 * through the API.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, which is why each
 * one is written out in full rather than looked up dynamically.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name} in apps/web/.env - copy it from .env.example.`);
  }
  return value;
}

/** Where the browser sends API requests. */
export const API_URL = required(process.env.NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL');

/** This app's own public URL, for canonical links and auth redirects. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Where Server Components send API requests. Can be an internal address that the
 * browser cannot reach; falls back to the public URL in development.
 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? API_URL;

export const features = {
  ai: process.env.NEXT_PUBLIC_ENABLE_AI === 'true',
  billing: process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true',
} as const;
