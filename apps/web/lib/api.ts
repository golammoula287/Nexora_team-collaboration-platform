import { hc } from 'hono/client';
import type { AppType } from '@nexora/api';
import { API_URL } from './env';

/**
 * Typed client for the browser.
 *
 * `AppType` is a TYPE import - no backend code is bundled. Every call is checked
 * against the real route definition, so changing a route's shape in apps/api
 * breaks `pnpm typecheck` here immediately. That is the whole point of the split.
 *
 *   const res = await api.health.$get();
 *   const body = await res.json();   // inferred from the route
 *
 * `credentials: 'include'` sends the session cookie across the origin boundary;
 * the API's CORS_ORIGIN must list this app's origin for it to be accepted.
 */
export const api = hc<AppType>(API_URL, {
  init: { credentials: 'include' },
});
