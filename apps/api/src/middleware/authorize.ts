import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { canInProject, type ActionFor, type Resource } from '@nexora/auth';
import type { AppBindings } from '../types/context.js';

/**
 * The last gate before a handler runs: may this role take this action on this
 * resource?
 *
 * Backed by the single matrix in `packages/auth/src/permissions.ts`, so the
 * answer here and the answer the UI uses to hide a button cannot diverge - and
 * so that changing a permission is a one-line change in one file.
 *
 * Must run after `requireOrg`.
 *
 *   app.post('/:orgSlug/projects',
 *     requireSession(s), requireOrg(s), authorize('create', 'project'), handler)
 */
export function authorize<R extends Resource>(action: ActionFor<R>, resource: R) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const role = c.get('role');
    const projectRole = c.get('projectRole');

    if (!canInProject(role, projectRole, action, resource)) {
      throw new HTTPException(403, {
        message: `Your role (${role}) cannot ${String(action)} a ${resource}.`,
      });
    }

    await next();
  });
}
