import type { app } from './app.js';

/**
 * The contract with apps/web. This is the ONLY thing the frontend imports from
 * the backend, and it must stay a type - importing runtime code from here into
 * the browser bundle collapses the whole split (see docs/ARCHITECTURE.md).
 *
 *   import type { AppType } from '@nexora/api';
 *   const api = hc<AppType>(url);
 */
export type AppType = typeof app;
