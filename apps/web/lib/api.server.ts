import 'server-only';
import { hc } from 'hono/client';
import { cookies } from 'next/headers';
import type { AppType } from '@nexora/api';
import { API_INTERNAL_URL } from './env';

/**
 * Typed client for Server Components and route handlers.
 *
 * A server-side fetch carries no browser cookie jar, so the incoming request's
 * cookies are forwarded explicitly - without this every RSC request would reach
 * the API unauthenticated and 401.
 *
 *   const api = await serverApi();
 *   const res = await api.health.$get();
 */
export async function serverApi() {
  const cookieHeader = (await cookies()).toString();

  return hc<AppType>(API_INTERNAL_URL, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}
