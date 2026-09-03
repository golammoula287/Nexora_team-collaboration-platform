import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import type { CreateSpaceInput, UpdateSpaceInput } from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Spaces: the level between an organization and its projects - a department, or
 * a client. Same rules as everything else: `withOrg` on every query, one
 * transaction per mutation, one audit row.
 */

export async function listSpaces(db: AnyDatabase, organizationId: string) {
  const scope = withOrg(db, organizationId);

  return db
    .select({
      id: schema.spaces.id,
      name: schema.spaces.name,
      slug: schema.spaces.slug,
      description: schema.spaces.description,
      icon: schema.spaces.icon,
      color: schema.spaces.color,
      position: schema.spaces.position,
      // Counted in SQL rather than by fetching the projects and measuring the
      // array, which would read every row to display a number.
      projectCount: sql<number>`(
        select count(*)::int from ${schema.projects}
        where ${schema.projects.spaceId} = ${schema.spaces.id}
          and ${schema.projects.deletedAt} is null
          and ${schema.projects.status} <> 'archived'
      )`,
    })
    .from(schema.spaces)
    .where(scope.where(schema.spaces))
    .orderBy(asc(schema.spaces.position));
}

export async function createSpace(db: AnyDatabase, actor: ActorContext, input: CreateSpaceInput) {
  const scope = withOrg(db, actor.organizationId);

  const [duplicate] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(scope.whereIncludingDeleted(schema.spaces, eq(schema.spaces.slug, input.slug)))
    .limit(1);

  if (duplicate) {
    throw new HTTPException(409, { message: `The address "${input.slug}" is already taken.` });
  }

  const [last] = await db
    .select({ position: schema.spaces.position })
    .from(schema.spaces)
    .where(scope.where(schema.spaces))
    .orderBy(desc(schema.spaces.position))
    .limit(1);

  const spaceId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.spaces).values(
      scope.values({
        id: spaceId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        position: keyBetween(last?.position ?? null, null),
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'space.created',
      entityType: 'space',
      entityId: spaceId,
      changes: { name: { from: null, to: input.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return spaceId;
  });
}

export async function updateSpace(
  db: AnyDatabase,
  actor: ActorContext,
  spaceId: string,
  input: UpdateSpaceInput,
) {
  const scope = withOrg(db, actor.organizationId);

  const [existing] = await db
    .select()
    .from(schema.spaces)
    .where(scope.where(schema.spaces, eq(schema.spaces.id, spaceId)))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'No such space.' });
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, next] of Object.entries(input)) {
    const current = (existing as Record<string, unknown>)[field];
    if (next !== undefined && next !== current) changes[field] = { from: current, to: next };
  }

  if (Object.keys(changes).length === 0) return existing;

  return scope.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.spaces)
      .set(input)
      .where(
        and(eq(schema.spaces.id, spaceId), eq(schema.spaces.organizationId, actor.organizationId)),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'space.updated',
      entityType: 'space',
      entityId: spaceId,
      changes,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}
