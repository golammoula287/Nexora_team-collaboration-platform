import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Resolves the Better Auth session from the request cookie and puts the user on
 * the context, or rejects with 401.
 *
 * Nothing downstream may read a user id from the request body. Every identity
 * in the system originates here - that is the whole point of the funnel, and
 * the specific hole the legacy app shipped with.
 */
export function requireSession(services: Services) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const session = await services.auth.api.getSession({ headers: c.req.raw.headers });

    if (!session?.user) {
      throw new HTTPException(401, { message: 'Sign in to continue.' });
    }

    // Checked on every request, not cached into the cookie: a deactivated or
    // banned account must lose access immediately, not when a cache expires.
    if (session.user.isActive === false) {
      throw new HTTPException(403, { message: 'This account has been deactivated.' });
    }
    if (session.user.banned === true) {
      throw new HTTPException(403, { message: 'This account is suspended.' });
    }

    c.set('user', {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    });
    c.set('sessionId', session.session.id);

    await next();
  });
}
