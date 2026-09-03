import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createDependencySchema,
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
} from '@nexora/shared';
import { authorize } from '../middleware/authorize.js';
import { requireOrg, resolveProjectRole } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { requestMeta } from '../lib/audit.js';
import {
  addDependency,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  updateTask,
} from '../services/tasks.js';
import type { ActorContext } from '../services/projects.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';
import type { Context } from 'hono';

/** Tasks, behind the same funnel as everything else. */
function actorFrom(c: Context<AppBindings>): ActorContext {
  return {
    organizationId: c.get('organization').id,
    actorId: c.get('user').id,
    ...requestMeta(c.req.raw.headers),
  };
}

export function taskRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);
  const projectRole = resolveProjectRole(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/tasks',
      session,
      org,
      authorize('read', 'task'),
      zValidator('query', listTasksQuerySchema),
      async (c) => {
        const tasks = await listTasks(services.db, c.get('organization').id, c.req.valid('query'));
        return c.json({ tasks });
      },
    )

    .post(
      '/orgs/:orgSlug/tasks',
      session,
      org,
      projectRole,
      authorize('create', 'task'),
      zValidator('json', createTaskSchema),
      async (c) => {
        const result = await createTask(services.db, actorFrom(c), c.req.valid('json'));
        return c.json(result, 201);
      },
    )

    .get('/orgs/:orgSlug/tasks/:taskId', session, org, authorize('read', 'task'), async (c) => {
      const result = await getTask(services.db, c.get('organization').id, c.req.param('taskId'));
      return c.json(result);
    })

    .patch(
      '/orgs/:orgSlug/tasks/:taskId',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', updateTaskSchema),
      async (c) => {
        const task = await updateTask(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json'),
        );
        return c.json({ task });
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/move',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', moveTaskSchema),
      async (c) => {
        const result = await moveTask(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json'),
        );
        return c.json(result);
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/dependencies',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', createDependencySchema),
      async (c) => {
        const result = await addDependency(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json'),
        );
        return c.json(result, 201);
      },
    )

    .delete(
      '/orgs/:orgSlug/tasks/:taskId',
      session,
      org,
      authorize('delete', 'task'),
      async (c) => {
        const result = await deleteTask(services.db, actorFrom(c), c.req.param('taskId'));
        return c.json(result);
      },
    );
}
