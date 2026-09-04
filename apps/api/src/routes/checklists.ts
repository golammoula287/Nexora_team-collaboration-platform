import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createChecklistItemSchema,
  createChecklistSchema,
  moveChecklistItemSchema,
  updateChecklistItemSchema,
  updateChecklistSchema,
} from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  listChecklists,
  moveChecklistItem,
  updateChecklist,
  updateChecklistItem,
} from '../services/checklists.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Checklists on a task.
 *
 * Ticking an item is a task update, so `task:update` guards all of it - a guest
 * who can read a task cannot tick its boxes.
 */
export function checklistRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/tasks/:taskId/checklists',
      session,
      org,
      authorize('read', 'task'),
      async (c) => {
        const checklists = await listChecklists(
          services.db,
          c.get('organization').id,
          c.req.param('taskId'),
        );
        return c.json({ checklists });
      },
    )

    .post(
      '/orgs/:orgSlug/tasks/:taskId/checklists',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', createChecklistSchema),
      async (c) => {
        const id = await createChecklist(
          services.db,
          actorFrom(c),
          c.req.param('taskId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .patch(
      '/orgs/:orgSlug/checklists/:checklistId',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', updateChecklistSchema),
      async (c) => {
        const checklist = await updateChecklist(
          services.db,
          actorFrom(c),
          c.req.param('checklistId'),
          c.req.valid('json'),
        );
        return c.json({ checklist });
      },
    )

    .delete(
      '/orgs/:orgSlug/checklists/:checklistId',
      session,
      org,
      authorize('update', 'task'),
      async (c) => {
        const result = await deleteChecklist(
          services.db,
          actorFrom(c),
          c.req.param('checklistId'),
        );
        return c.json(result);
      },
    )

    .post(
      '/orgs/:orgSlug/checklists/:checklistId/items',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', createChecklistItemSchema),
      async (c) => {
        const id = await createChecklistItem(
          services.db,
          actorFrom(c),
          c.req.param('checklistId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .patch(
      '/orgs/:orgSlug/checklist-items/:itemId',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', updateChecklistItemSchema),
      async (c) => {
        const item = await updateChecklistItem(
          services.db,
          actorFrom(c),
          c.req.param('itemId'),
          c.req.valid('json'),
        );
        return c.json({ item });
      },
    )

    .post(
      '/orgs/:orgSlug/checklist-items/:itemId/move',
      session,
      org,
      authorize('update', 'task'),
      zValidator('json', moveChecklistItemSchema),
      async (c) => {
        const item = await moveChecklistItem(
          services.db,
          actorFrom(c),
          c.req.param('itemId'),
          c.req.valid('json'),
        );
        return c.json({ item });
      },
    )

    .delete(
      '/orgs/:orgSlug/checklist-items/:itemId',
      session,
      org,
      authorize('update', 'task'),
      async (c) => {
        const result = await deleteChecklistItem(
          services.db,
          actorFrom(c),
          c.req.param('itemId'),
        );
        return c.json(result);
      },
    );
}
