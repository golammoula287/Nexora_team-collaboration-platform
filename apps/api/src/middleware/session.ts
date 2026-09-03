import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types/context.js';

/**
 * Resolves the Better Auth session from the request cookie and puts the user on
 * the context, or rejects with 401.
 *
 * PHASE 2 implements this. Until then it refuses every request rather than
 * passing through - a middleware that silently allows traffic is exactly the
 * bug class this rebuild exists to remove.
 */
export const requireSession = createMiddleware<AppBindings>(async () => {
  throw new HTTPException(501, {
    message: 'Session middleware is implemented in phase 2 (see docs/WORK-SECTIONS.md 2.1).',
  });
});
