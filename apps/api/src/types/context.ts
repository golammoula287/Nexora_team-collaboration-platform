import type { OrgRole } from '@nexora/shared';
import type { Services } from '../services.js';

/**
 * What each middleware in the funnel puts on the request context.
 *
 *   session   -> user, sessionId
 *   org       -> organization, role
 *   authorize -> nothing; it either passes or throws 403
 *
 * A handler that reads `organization` is guaranteed by the type system to sit
 * behind the org middleware, because the value only exists once that ran.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface ActiveOrg {
  id: string;
  slug: string;
  name: string;
}

export interface AppBindings {
  Variables: {
    /** Set by the session middleware. */
    user: AuthUser;
    sessionId: string;
    /** Set by the org middleware. */
    organization: ActiveOrg;
    role: OrgRole;
    /** Project-level role override, when the route names a project. */
    projectRole: OrgRole | null;
    /** Set by the logger, echoed in the X-Request-Id response header. */
    requestId: string;
    /** The database and auth handles this app was built with. */
    services: Services;
  };
}
