import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { canManageRole } from '@nexora/auth';
import { schema } from '@nexora/db';
import { updateMemberRoleSchema } from '@nexora/shared';
import type { OrgRole } from '@nexora/shared';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import { recordActivity, requestMeta } from '../lib/audit.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

/**
 * Membership changes.
 *
 * Better Auth's organization plugin has its own updateMemberRole and
 * removeMember, and they work - but they check only whether the caller's role
 * holds the permission, not the relationship between the two roles. That lets
 * an admin demote another admin and take sole control.
 *
 * These routes go through `canManageRole`, which requires the actor to
 * outrank the target strictly, and they write the audit row that a membership
 * change deserves. The UI calls these rather than the plugin's equivalents.
 */
export function memberRoute(services: Services) {
  return new Hono<AppBindings>()
    .patch(
      '/orgs/:orgSlug/members/:memberId/role',
      requireSession(services),
      requireOrg(services),
      authorize('set-role', 'member'),
      zValidator('json', updateMemberRoleSchema),
      async (c) => {
        const organization = c.get('organization');
        const actor = c.get('user');
        const actorRole = c.get('role');
        const nextRole = c.req.valid('json').role;
        const memberId = c.req.param('memberId');

        const [target] = await services.db
          .select()
          .from(schema.member)
          .where(
            and(
              eq(schema.member.id, memberId),
              // Scoped to the caller's org: a member id from another tenant
              // resolves to nothing rather than to someone else's row.
              eq(schema.member.organizationId, organization.id),
            ),
          )
          .limit(1);

        if (!target) {
          throw new HTTPException(404, { message: 'No such member.' });
        }

        if (target.userId === actor.id) {
          // Otherwise the last owner could demote themselves and lock the
          // organization out of its own billing and deletion.
          throw new HTTPException(400, { message: 'You cannot change your own role.' });
        }

        if (!canManageRole(actorRole, target.role as OrgRole, nextRole)) {
          throw new HTTPException(403, {
            message: `A ${actorRole} cannot change a ${target.role} to ${nextRole}.`,
          });
        }

        const meta = requestMeta(c.req.raw.headers);

        await services.db.transaction(async (tx) => {
          await tx
            .update(schema.member)
            .set({ role: nextRole })
            .where(eq(schema.member.id, memberId));

          await recordActivity(tx, {
            organizationId: organization.id,
            actorId: actor.id,
            action: 'member.role_changed',
            entityType: 'member',
            entityId: target.id,
            changes: { role: { from: target.role, to: nextRole } },
            ...meta,
          });
        });

        return c.json({ id: target.id, role: nextRole });
      },
    )
    .delete(
      '/orgs/:orgSlug/members/:memberId',
      requireSession(services),
      requireOrg(services),
      authorize('remove', 'member'),
      async (c) => {
        const organization = c.get('organization');
        const actor = c.get('user');
        const actorRole = c.get('role');
        const memberId = c.req.param('memberId');

        const [target] = await services.db
          .select()
          .from(schema.member)
          .where(
            and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organization.id)),
          )
          .limit(1);

        if (!target) {
          throw new HTTPException(404, { message: 'No such member.' });
        }

        if (target.userId === actor.id) {
          throw new HTTPException(400, {
            message: 'Leave the organization instead of removing yourself.',
          });
        }

        // Same ranking rule as a role change: you cannot remove a peer or
        // anyone above you.
        if (!canManageRole(actorRole, target.role as OrgRole, target.role as OrgRole)) {
          throw new HTTPException(403, {
            message: `A ${actorRole} cannot remove a ${target.role}.`,
          });
        }

        const meta = requestMeta(c.req.raw.headers);

        await services.db.transaction(async (tx) => {
          await tx.delete(schema.member).where(eq(schema.member.id, memberId));

          await recordActivity(tx, {
            organizationId: organization.id,
            actorId: actor.id,
            action: 'member.removed',
            entityType: 'member',
            entityId: target.id,
            changes: { member: { from: target.userId, to: null } },
            ...meta,
          });
        });

        return c.json({ removed: memberId });
      },
    )
    .get(
      '/orgs/:orgSlug/invitations',
      requireSession(services),
      requireOrg(services),
      authorize('invite', 'member'),
      async (c) => {
        const organization = c.get('organization');

        const invitations = await services.db
          .select({
            id: schema.invitation.id,
            email: schema.invitation.email,
            role: schema.invitation.role,
            status: schema.invitation.status,
            expiresAt: schema.invitation.expiresAt,
          })
          .from(schema.invitation)
          .where(eq(schema.invitation.organizationId, organization.id));

        return c.json({ invitations });
      },
    );
}
