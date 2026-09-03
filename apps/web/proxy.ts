import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 renamed middleware to `proxy`. Same execution point, same
 * constraints.
 *
 * This is an OPTIMISTIC redirect and nothing more: it checks whether a session
 * cookie is present, never whether it is valid. It does not call the API and it
 * does not touch the database.
 *
 * That is deliberate, and Next's own guidance. A cookie's presence is trivially
 * forgeable, so treating this as an authorization boundary would be a hole. The
 * real check happens in the API's session middleware on every request; the
 * worst a forged cookie achieves here is reaching a page that then renders an
 * error because its data fetch returned 401.
 */

const SESSION_COOKIE = 'nexora.session_token';

/** Routes that require a session cookie to be worth rendering. */
const PROTECTED =
  /^\/(?!sign-in|sign-up|reset-password|accept-invite|two-factor|pricing|changelog|portal)[^/]+/;

/** Auth screens a signed-in user should not linger on. */
const AUTH_ROUTES = /^\/(sign-in|sign-up)$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.has(SESSION_COOKIE) || request.cookies.has(`__Secure-${SESSION_COOKIE}`);

  if (!hasSession && PROTECTED.test(pathname) && pathname !== '/') {
    const url = new URL('/sign-in', request.url);
    // Come back here once signed in.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_ROUTES.test(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and the Next internals entirely.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*[.](?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
