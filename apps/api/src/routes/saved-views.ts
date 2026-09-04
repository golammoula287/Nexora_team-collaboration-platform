import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createSavedViewSchema,
  listSavedViewsQuerySchema,
  updateSavedViewSchema,
} from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import {
  createSavedView,
  deleteSavedView,
  getSavedViewByToken,
  listSavedViews,
  updateSavedView,
} from '../services/saved-views.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Saved views.
 *
 * Note what the share-token route does *not* do: it sits behind `session` and
 * `org` like everything else. The token names a view; it is not a key to the
 * data behind it. A route that skipped the funnel because the caller had a
 * long random string would be a tenant leak, and no amount of entropy fixes
 * that.
 */
export function savedViewRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/views',
      session,
      org,
      authorize('read', 'project'),
      zValidator('query', listSavedViewsQuerySchema),
      async (c) => {
        const views = await listSavedViews(
          services.db,
          c.get('organization').id,
          c.get('user').id,
          c.req.valid('query').projectId,
        );
        return c.json({ views });
      },
    )

    .get(
      '/orgs/:orgSlug/views/shared/:shareToken',
      session,
      org,
      authorize('read', 'project'),
      async (c) => {
        const view = await getSavedViewByToken(
          services.db,
          c.get('organization').id,
          c.req.param('shareToken'),
        );
        return c.json({ view });
      },
    )

    .post(
      '/orgs/:orgSlug/views',
      session,
      org,
      authorize('read', 'project'),
      zValidator('json', createSavedViewSchema),
      async (c) => {
        const id = await createSavedView(services.db, actorFrom(c), c.req.valid('json'));
        return c.json({ id }, 201);
      },
    )

    .patch(
      '/orgs/:orgSlug/views/:viewId',
      session,
      org,
      authorize('read', 'project'),
      zValidator('json', updateSavedViewSchema),
      async (c) => {
        // Ownership, not role, decides this one - see the service.
        const view = await updateSavedView(
          services.db,
          actorFrom(c),
          c.req.param('viewId'),
          c.req.valid('json'),
        );
        return c.json({ view });
      },
    )

    .delete(
      '/orgs/:orgSlug/views/:viewId',
      session,
      org,
      authorize('read', 'project'),
      async (c) => {
        const result = await deleteSavedView(services.db, actorFrom(c), c.req.param('viewId'));
        return c.json(result);
      },
    );
}
