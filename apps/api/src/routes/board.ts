import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createColumnSchema,
  deleteColumnSchema,
  moveColumnSchema,
  updateColumnSchema,
} from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg, resolveProjectRole } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import {
  createColumn,
  deleteColumn,
  listColumns,
  moveColumn,
  updateColumn,
} from '../services/columns.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Board columns, behind the same funnel as everything else.
 *
 * Editing the board is a project change, not a task change: `project:update`
 * rather than `task:update`, so a member who can move cards cannot rename the
 * columns those cards live in.
 */
export function boardRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);
  const projectRole = resolveProjectRole(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/projects/:projectId/columns',
      session,
      org,
      projectRole,
      authorize('read', 'project'),
      async (c) => {
        const columns = await listColumns(
          services.db,
          c.get('organization').id,
          c.req.param('projectId'),
        );
        return c.json({ columns });
      },
    )

    .post(
      '/orgs/:orgSlug/projects/:projectId/columns',
      session,
      org,
      projectRole,
      authorize('update', 'project'),
      zValidator('json', createColumnSchema),
      async (c) => {
        const id = await createColumn(
          services.db,
          actorFrom(c),
          c.req.param('projectId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .patch(
      '/orgs/:orgSlug/columns/:columnId',
      session,
      org,
      authorize('update', 'project'),
      zValidator('json', updateColumnSchema),
      async (c) => {
        const column = await updateColumn(
          services.db,
          actorFrom(c),
          c.req.param('columnId'),
          c.req.valid('json'),
        );
        return c.json({ column });
      },
    )

    .post(
      '/orgs/:orgSlug/columns/:columnId/move',
      session,
      org,
      authorize('update', 'project'),
      zValidator('json', moveColumnSchema),
      async (c) => {
        const column = await moveColumn(
          services.db,
          actorFrom(c),
          c.req.param('columnId'),
          c.req.valid('json'),
        );
        return c.json({ column });
      },
    )

    .post(
      '/orgs/:orgSlug/columns/:columnId/delete',
      session,
      org,
      authorize('update', 'project'),
      zValidator('json', deleteColumnSchema),
      async (c) => {
        // POST rather than DELETE: the request carries a body naming the column
        // that inherits the cards, and a DELETE with a body is poorly supported
        // by enough clients to be worth avoiding.
        const result = await deleteColumn(
          services.db,
          actorFrom(c),
          c.req.param('columnId'),
          c.req.valid('json').moveTasksToColumnId,
        );
        return c.json(result);
      },
    );
}
