import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types/context.js';

/**
 * Turns the :orgSlug route param into an organization plus the caller's role in
 * it. A user who is not a member gets 404, not 403 - existence of an org is
 * itself information they are not entitled to.
 *
 * Must run after requireSession. PHASE 2 implements it.
 */
export const requireOrg = createMiddleware<AppBindings>(async () => {
  throw new HTTPException(501, {
    message: 'Org middleware is implemented in phase 2 (see docs/WORK-SECTIONS.md 2.3).',
  });
});
