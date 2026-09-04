import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { commentToTaskSchema, taskToProjectSchema } from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { commentToTask, taskToProject } from '../services/conversions.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Promoting a comment into a task, and a task into a project.
 *
 * Each is guarded by the permission for the thing being *created*, not the
 * thing being read: turning a comment into a task is a `task:create`, and
 * promoting a task is a `project:create`. Someone who can read a thread but not
 * create work should not be able to create work by going through a thread.
 */
export function conversionRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);

  return new Hono<AppBindings>()
    .post(
      '/orgs/:orgSlug/comments/:commentId/to-task',
      session,
      org,
      authorize('create', 'task'),
      zValidator('json', commentToTaskSchema),
      async (c) => {
        const id = await commentToTask(
          services.db,
          actorFrom(c),
          c.req.param('commentId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/to-project',
      session,
      org,
      authorize('create', 'project'),
      zValidator('json', taskToProjectSchema),
      async (c) => {
        const id = await taskToProject(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    );
}
