import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types/context.js';

/**
 * The last gate before a handler runs: can this role perform this action on this
 * resource? Backed by the single permission matrix in packages/auth.
 *
 * Must run after requireOrg. PHASE 2 implements it.
 *
 *   app.post('/:orgSlug/projects',
 *     requireSession, requireOrg, authorize('create', 'project'), handler)
 */
export function authorize(action: string, resource: string) {
  return createMiddleware<AppBindings>(async () => {
    throw new HTTPException(501, {
      message:
        `Authorization for ${action}:${resource} is implemented in phase 2 ` +
        '(see docs/WORK-SECTIONS.md 2.4).',
    });
  });
}
