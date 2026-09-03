import { Hono } from 'hono';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * The first routes to go through the whole funnel end to end:
 *
 *   session -> org -> authorize -> handler
 *
 * Phase 4 adds the real resources behind exactly this chain.
 */
export function organizationRoute(services: Services) {
  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug',
      requireSession(services),
      requireOrg(services),
      authorize('read', 'organization'),
      (c) => c.json({ organization: c.get('organization'), role: c.get('role') }),
    )
    .get(
      '/orgs/:orgSlug/members',
      requireSession(services),
      requireOrg(services),
      authorize('read', 'member'),
      async (c) => {
        const organization = c.get('organization');

        const members = await services.db.query.member.findMany({
          where: (m, { eq }) => eq(m.organizationId, organization.id),
          with: { user: { columns: { id: true, name: true, email: true, image: true } } },
        });

        return c.json({
          members: members.map((m) => ({
            id: m.id,
            role: m.role,
            user: m.user,
          })),
        });
      },
    )
    .get(
      '/orgs/:orgSlug/audit-log',
      requireSession(services),
      requireOrg(services),
      // Only owner and admin hold this permission - the route exists here in
      // phase 2 so the role matrix has a route to be tested against.
      authorize('read', 'auditLog'),
      (c) => c.json({ entries: [] }),
    );
}
