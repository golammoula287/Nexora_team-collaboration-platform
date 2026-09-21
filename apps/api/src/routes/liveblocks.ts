import { zValidator } from '@hono/zod-validator';
import { Liveblocks } from '@liveblocks/node';
import { schema, withOrg } from '@nexora/db';
import { canInProject } from '@nexora/auth';
import type { OrgRole } from '@nexora/shared';
import { parseRealtimeRoom } from '@nexora/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { env } from '../env.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

const requestSchema = z.object({ room: z.string().max(160) });

/** Issues a token for exactly one existing resource in the caller's organization. */
export function liveblocksRoute(services: Services) {
  return new Hono<AppBindings>().post(
    '/orgs/:orgSlug/liveblocks-auth',
    requireSession(services),
    requireOrg(services),
    zValidator('json', requestSchema),
    async (c) => {
      const orgId = c.get('organization').id;
      const parsed = parseRealtimeRoom(c.req.valid('json').room);
      if (!parsed || parsed.organizationId !== orgId) {
        throw new HTTPException(404, { message: 'Room not found.' });
      }
      const scope = withOrg(services.db, orgId);
      const user = c.get('user');
      let access: '*:read' | '*:write';
      if (parsed.kind === 'document') {
        const [document] = await services.db
          .select({ id: schema.documents.id, projectId: schema.documents.projectId })
          .from(schema.documents)
          .where(scope.where(schema.documents, eq(schema.documents.id, parsed.id)))
          .limit(1);
        if (!document) {
          throw new HTTPException(404, { message: 'Room not found.' });
        }
        const projectRole = document.projectId
          ? await memberProjectRole(services, orgId, document.projectId, user.id)
          : null;
        if (!canInProject(c.get('role'), projectRole, 'read', 'document')) {
          throw new HTTPException(404, { message: 'Room not found.' });
        }
        access = canInProject(c.get('role'), projectRole, 'update', 'document')
          ? '*:write'
          : '*:read';
      } else {
        const [project] = await services.db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(scope.where(schema.projects, eq(schema.projects.id, parsed.id)))
          .limit(1);
        const projectRole = project
          ? await memberProjectRole(services, orgId, parsed.id, user.id)
          : null;
        if (!project || !canInProject(c.get('role'), projectRole, 'read', 'project')) {
          throw new HTTPException(404, { message: 'Room not found.' });
        }
        access = canInProject(c.get('role'), projectRole, 'update', 'task') ? '*:write' : '*:read';
      }

      if (!env.LIVEBLOCKS_SECRET_KEY) {
        throw new HTTPException(503, { message: 'Realtime service is not configured.' });
      }
      const liveblocks = new Liveblocks({ secret: env.LIVEBLOCKS_SECRET_KEY });
      const session = liveblocks.prepareSession(user.id, {
        organizationId: orgId,
        userInfo: { name: user.name, ...(user.image ? { avatar: user.image } : {}) },
      });
      session.allow(c.req.valid('json').room, [access]);
      const { body, status } = await session.authorize();
      return new Response(body, {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    },
  );
}

async function memberProjectRole(
  services: Services,
  orgId: string,
  projectId: string,
  userId: string,
): Promise<OrgRole | null> {
  const scope = withOrg(services.db, orgId);
  const [member] = await services.db
    .select({ role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .where(
      scope.where(
        schema.projectMembers,
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return (member?.role as OrgRole | undefined) ?? null;
}
