import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  applyProjectTemplateSchema,
  applyTaskTemplateSchema,
  createProjectTemplateSchema,
  createTaskTemplateSchema,
  duplicateProjectSchema,
  listTemplatesQuerySchema,
} from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg, resolveProjectRole } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import {
  applyProjectTemplate,
  applyTaskTemplate,
  createProjectTemplate,
  createTaskTemplate,
  deleteTemplate,
  duplicateProject,
  listTemplates,
} from '../services/templates.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Templates and duplication.
 *
 * Saving a template reads; applying one creates. So saving a *task* template
 * needs `task:read` and applying it needs `task:create`, and the project
 * equivalents use `project:read` / `project:create`. Deleting a template is a
 * project-level change - it affects everyone's list, not just the author's.
 */
export function templateRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);
  const projectRole = resolveProjectRole(services);

  return new Hono<AppBindings>()
    .get(
      '/orgs/:orgSlug/templates',
      session,
      org,
      authorize('read', 'project'),
      zValidator('query', listTemplatesQuerySchema),
      async (c) => {
        const templates = await listTemplates(
          services.db,
          c.get('organization').id,
          c.req.valid('query').kind,
        );
        return c.json({ templates });
      },
    )

    .post(
      '/orgs/:orgSlug/templates/task',
      session,
      org,
      authorize('read', 'task'),
      zValidator('json', createTaskTemplateSchema),
      async (c) => {
        const id = await createTaskTemplate(services.db, actorFrom(c), c.req.valid('json'));
        return c.json({ id }, 201);
      },
    )

    .post(
      '/orgs/:orgSlug/templates/project',
      session,
      org,
      authorize('read', 'project'),
      zValidator('json', createProjectTemplateSchema),
      async (c) => {
        const id = await createProjectTemplate(services.db, actorFrom(c), c.req.valid('json'));
        return c.json({ id }, 201);
      },
    )

    .post(
      '/orgs/:orgSlug/templates/:templateId/apply-task',
      session,
      org,
      authorize('create', 'task'),
      zValidator('json', applyTaskTemplateSchema),
      async (c) => {
        const id = await applyTaskTemplate(
          services.db,
          actorFrom(c),
          c.req.param('templateId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .post(
      '/orgs/:orgSlug/templates/:templateId/apply-project',
      session,
      org,
      authorize('create', 'project'),
      zValidator('json', applyProjectTemplateSchema),
      async (c) => {
        const id = await applyProjectTemplate(
          services.db,
          actorFrom(c),
          c.req.param('templateId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    )

    .delete(
      '/orgs/:orgSlug/templates/:templateId',
      session,
      org,
      authorize('update', 'project'),
      async (c) => {
        const result = await deleteTemplate(services.db, actorFrom(c), c.req.param('templateId'));
        return c.json(result);
      },
    )

    .post(
      '/orgs/:orgSlug/projects/:projectId/duplicate',
      session,
      org,
      projectRole,
      authorize('create', 'project'),
      zValidator('json', duplicateProjectSchema),
      async (c) => {
        const id = await duplicateProject(
          services.db,
          actorFrom(c),
          c.req.param('projectId'),
          c.req.valid('json'),
        );
        return c.json({ id }, 201);
      },
    );
}
