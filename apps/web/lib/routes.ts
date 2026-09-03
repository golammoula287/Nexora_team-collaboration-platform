import type { Route } from 'next';

/**
 * `typedRoutes` checks every href against the routes that actually exist,
 * which is exactly the class of bug the legacy app shipped - 7 of its 12
 * routes were commented out and unreachable. A path carrying a query string
 * is not a statically known literal, so it needs a cast.
 *
 * Confining every such cast to this file keeps the guarantee everywhere else:
 * a bare string route still fails to compile if the page is missing.
 */
export function withQuery(pathname: Route, query: Record<string, string | undefined>): Route {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }

  const search = params.toString();
  return (search ? `${pathname}?${search}` : pathname) as Route;
}

/**
 * A redirect target supplied by the user (`?next=`). Only same-origin paths
 * are allowed through - an open redirect is a phishing primitive.
 */
export function safeNext(next: string | undefined, fallback: Route = '/'): Route {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  return next as Route;
}
