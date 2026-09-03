import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema, withOrg } from '@nexora/db';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Every dependency edge in a project, for the timeline to draw.
 *
 * A separate route rather than embedding them in the task list: the board and
 * the list do not need them, and fetching a graph they ignore would make the
 * common view pay for the rare one.
 */
export function dependencyListRoute(services: Services) {
  return new Hono<AppBindings>().get(
    '/orgs/:orgSlug/projects/:projectId/dependencies',
    requireSession(services),
    requireOrg(services),
    authorize('read', 'task'),
    async (c) => {
      const organizationId = c.get('organization').id;
      const scope = withOrg(services.db, organizationId);

      const edges = await services.db
        .select({
          taskId: schema.taskDependencies.taskId,
          dependsOnTaskId: schema.taskDependencies.dependsOnTaskId,
          type: schema.taskDependencies.type,
        })
        .from(schema.taskDependencies)
        .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.taskId))
        .where(scope.where(schema.tasks, eq(schema.tasks.projectId, c.req.param('projectId'))));

      return c.json({ dependencies: edges });
    },
  );
}
