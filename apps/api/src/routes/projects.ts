import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createProjectSchema,
  createSpaceSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  updateSpaceSchema,
} from '@nexora/shared';
import { authorize } from '../middleware/authorize.js';
import { requireOrg, resolveProjectRole } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { actorFrom } from '../lib/actor.js';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listTrashedProjects,
  restoreProject,
  updateProject,
} from '../services/projects.js';
import { createSpace, listSpaces, updateSpace } from '../services/spaces.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Spaces and projects - the first real resources, and the shape every later
 * one follows:
 *
 *   session -> org -> [resolveProjectRole] -> authorize -> zValidator -> service
 *
 * The handler itself does almost nothing: by the time it runs, identity, tenant
 * and permission are all settled, and the service owns the transaction.
 */


export function projectRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);
  const projectRole = resolveProjectRole(services);

  return (
    new Hono<AppBindings>()
      // --- Spaces -----------------------------------------------------------
      .get('/orgs/:orgSlug/spaces', session, org, authorize('read', 'space'), async (c) => {
        const spaces = await listSpaces(services.db, c.get('organization').id);
        return c.json({ spaces });
      })

      .post(
        '/orgs/:orgSlug/spaces',
        session,
        org,
        authorize('create', 'space'),
        zValidator('json', createSpaceSchema),
        async (c) => {
          const id = await createSpace(services.db, actorFrom(c), c.req.valid('json'));
          return c.json({ id }, 201);
        },
      )

      .patch(
        '/orgs/:orgSlug/spaces/:spaceId',
        session,
        org,
        authorize('update', 'space'),
        zValidator('json', updateSpaceSchema),
        async (c) => {
          const space = await updateSpace(
            services.db,
            actorFrom(c),
            c.req.param('spaceId'),
            c.req.valid('json'),
          );
          return c.json({ space });
        },
      )

      // --- Projects ---------------------------------------------------------
      .get(
        '/orgs/:orgSlug/projects',
        session,
        org,
        authorize('read', 'project'),
        zValidator('query', listProjectsQuerySchema),
        async (c) => {
          const query = c.req.valid('query');
          const projects = await listProjects(services.db, c.get('organization').id, {
            spaceId: query.spaceId,
            status: query.status,
            includeArchived: query.includeArchived ?? false,
          });
          return c.json({ projects });
        },
      )

      .get(
        '/orgs/:orgSlug/projects/trash',
        session,
        org,
        // Seeing what has been deleted is a management view, not a reading one.
        authorize('delete', 'project'),
        async (c) => {
          const projects = await listTrashedProjects(services.db, c.get('organization').id);
          return c.json({ projects });
        },
      )

      .post(
        '/orgs/:orgSlug/projects',
        session,
        org,
        authorize('create', 'project'),
        zValidator('json', createProjectSchema),
        async (c) => {
          const id = await createProject(services.db, actorFrom(c), c.req.valid('json'));
          return c.json({ id }, 201);
        },
      )

      .get(
        '/orgs/:orgSlug/projects/:projectId',
        session,
        org,
        // A project-level role can grant read access the org role does not.
        projectRole,
        authorize('read', 'project'),
        async (c) => {
          const result = await getProject(
            services.db,
            c.get('organization').id,
            c.req.param('projectId'),
          );
          return c.json(result);
        },
      )

      .patch(
        '/orgs/:orgSlug/projects/:projectId',
        session,
        org,
        projectRole,
        authorize('update', 'project'),
        zValidator('json', updateProjectSchema),
        async (c) => {
          const project = await updateProject(
            services.db,
            actorFrom(c),
            c.req.param('projectId'),
            c.req.valid('json'),
          );
          return c.json({ project });
        },
      )

      .delete(
        '/orgs/:orgSlug/projects/:projectId',
        session,
        org,
        projectRole,
        authorize('delete', 'project'),
        async (c) => {
          const result = await deleteProject(services.db, actorFrom(c), c.req.param('projectId'));
          return c.json(result);
        },
      )

      .post(
        '/orgs/:orgSlug/projects/:projectId/restore',
        session,
        org,
        authorize('delete', 'project'),
        async (c) => {
          const result = await restoreProject(services.db, actorFrom(c), c.req.param('projectId'));
          return c.json(result);
        },
      )
  );
}
