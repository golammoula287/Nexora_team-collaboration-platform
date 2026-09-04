import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { bulkUpdateTasksSchema } from '@nexora/shared';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { actorFrom } from '../lib/actor.js';
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  listTrashedTasks,
  restoreTasks,
} from '../services/task-operations.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

const taskIdsSchema = z.object({
  taskIds: z.array(z.uuid()).min(1, 'Select at least one task.').max(200),
});


/**
 * Bulk operations and Trash.
 *
 * These sit on their own paths rather than as variants of the single-task
 * routes, so the permission each needs is visible at the route: bulk edit is an
 * update, bulk delete and restore are deletes.
 */
export function taskOperationsRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);

  return new Hono<AppBindings>()
    .post(
      '/orgs/:orgSlug/tasks/bulk',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', bulkUpdateTasksSchema),
      async (c) => {
        const result = await bulkUpdateTasks(services.db, actorFrom(c), c.req.valid('json'));
        return c.json(result);
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/bulk-delete',
      session,
      org,
      authorize('delete', 'task'),
      zValidator('json', taskIdsSchema),
      async (c) => {
        const result = await bulkDeleteTasks(
          services.db,
          actorFrom(c),
          c.req.valid('json').taskIds,
        );
        return c.json(result);
      },
    )

    .get(
      '/orgs/:orgSlug/trash/tasks',
      session,
      org,
      // Seeing what was deleted is a management view, not a reading one.
      authorize('delete', 'task'),
      async (c) => {
        const tasks = await listTrashedTasks(services.db, c.get('organization').id);
        return c.json({ tasks });
      },
    )

    .post(
      '/orgs/:orgSlug/trash/tasks/restore',
      session,
      org,
      authorize('delete', 'task'),
      zValidator('json', taskIdsSchema),
      async (c) => {
        const result = await restoreTasks(services.db, actorFrom(c), c.req.valid('json').taskIds);
        return c.json(result);
      },
    );
}
