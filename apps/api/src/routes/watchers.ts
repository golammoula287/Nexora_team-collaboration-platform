import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { listWatchers, unwatchTask, watchTask } from '../services/watchers.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Watching a task.
 *
 * Guarded by `task:read`, not `task:update`: subscribing to something you are
 * allowed to see does not change it, and requiring update rights would stop a
 * guest following work they are entitled to read.
 */
const watchSchema = z.object({
  /** Omitted means the caller. Naming someone else loops a colleague in. */
  userId: z.uuid().optional(),
});

export function watcherRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/tasks/:taskId/watchers',
      session,
      org,
      authorize('read', 'task'),
      async (c) => {
        const watchers = await listWatchers(
          services.db,
          c.get('organization').id,
          c.req.param('taskId'),
        );
        return c.json({ watchers });
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/watchers',
      session,
      org,
      authorize('read', 'task'),
      zValidator('json', watchSchema),
      async (c) => {
        const result = await watchTask(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json').userId,
        );
        return c.json(result);
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/watchers/remove',
      session,
      org,
      authorize('read', 'task'),
      zValidator('json', watchSchema),
      async (c) => {
        const result = await unwatchTask(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json').userId,
        );
        return c.json(result);
      },
    );
}
