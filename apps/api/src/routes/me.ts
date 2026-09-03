import { Hono } from 'hono';
import { requireSession } from '../middleware/session.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * The signed-in user, plus the organizations they belong to. The web app calls
 * this once on load to build the org switcher.
 */
export function meRoute(services: Services) {
  return new Hono<AppBindings>().get('/me', requireSession(services), async (c) => {
    const user = c.get('user');

    const memberships = await services.db.query.member.findMany({
      where: (m, { eq }) => eq(m.userId, user.id),
      with: { organization: { columns: { id: true, slug: true, name: true, logo: true } } },
    });

    return c.json({
      user,
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        slug: m.organization.slug,
        name: m.organization.name,
        logo: m.organization.logo,
        role: m.role,
      })),
    });
  });
}
