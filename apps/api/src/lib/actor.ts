import type { Context } from 'hono';
import { requestMeta } from './audit.js';
import type { ActorContext } from '../services/projects.js';
import type { AppBindings } from '../types/context.js';

/**
 * Who is doing this, and from where.
 *
 * Every field is derived from the middleware chain - the session for the user,
 * the org middleware for the organization - and never from the request body.
 * That is the rule the legacy app's admin-escalation hole came from breaking
 * (CLAUDE.md), so it is worth having exactly one place that builds this.
 */
export function actorFrom(c: Context<AppBindings>): ActorContext {
  return {
    organizationId: c.get('organization').id,
    actorId: c.get('user').id,
    ...requestMeta(c.req.raw.headers),
  };
}
