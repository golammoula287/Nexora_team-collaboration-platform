import { and, eq, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { schema } from '@nexora/db';
import type { OrgRole } from '@nexora/shared';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Turns the `:orgSlug` route param into an organization plus the caller's role
 * in it.
 *
 * A non-member gets 404, never 403. Whether an organization exists at a given
 * slug is itself information they are not entitled to, and a 403 confirms it.
 *
 * The role comes from the `member` table, never from the request. This is the
 * exact substitution the legacy app allowed when it read `isAdmin` off the body.
 */
export function requireOrg(services: Services) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const slug = c.req.param('orgSlug');
    if (!slug) {
      throw new HTTPException(400, { message: 'Missing organization in the path.' });
    }

    const user = c.get('user');

    const [row] = await services.db
      .select({
        id: schema.organization.id,
        slug: schema.organization.slug,
        name: schema.organization.name,
        role: schema.member.role,
      })
      .from(schema.organization)
      .innerJoin(
        schema.member,
        and(
          eq(schema.member.organizationId, schema.organization.id),
          eq(schema.member.userId, user.id),
        ),
      )
      .where(eq(schema.organization.slug, slug))
      .limit(1);

    if (!row) {
      throw new HTTPException(404, { message: 'Not found.' });
    }

    c.set('organization', { id: row.id, slug: row.slug, name: row.name });
    c.set('role', row.role as OrgRole);
    c.set('projectRole', null);

    await next();
  });
}

/**
 * Optional project-level role override, for routes that name a `:projectId`.
 * Runs after `requireOrg`, and is scoped to the resolved organization so a
 * project id from another tenant resolves to nothing.
 */
export function resolveProjectRole(services: Services) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const projectId = c.req.param('projectId');
    const organization = c.get('organization');

    if (projectId) {
      const [row] = await services.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .innerJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.projectMembers.projectId),
            eq(schema.projects.organizationId, organization.id),
            isNull(schema.projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(schema.projectMembers.projectId, projectId),
            eq(schema.projectMembers.userId, c.get('user').id),
            eq(schema.projectMembers.organizationId, organization.id),
          ),
        )
        .limit(1);

      c.set('projectRole', (row?.role as OrgRole | undefined) ?? null);
    }

    await next();
  });
}
