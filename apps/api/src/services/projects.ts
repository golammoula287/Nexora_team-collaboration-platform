import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, keySequence, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import type { CreateProjectInput, UpdateProjectInput } from '@nexora/shared';
import { recordActivity, type AuditEntry } from '../lib/audit.js';

/**
 * Project business logic.
 *
 * Every read and write goes through `withOrg`, so the organization predicate is
 * in the SQL rather than applied afterwards. Every mutation runs in one
 * transaction that also writes the audit row - a change and its record cannot
 * end up disagreeing.
 */

export interface ActorContext {
  organizationId: string;
  actorId: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** The four columns every new project gets as its board. */
const DEFAULT_STATUSES = [
  { name: 'Backlog', category: 'todo' as const, color: 'slate' },
  { name: 'In progress', category: 'in-progress' as const, color: 'indigo' },
  { name: 'In review', category: 'in-progress' as const, color: 'amber' },
  { name: 'Done', category: 'done' as const, color: 'green' },
];

export async function listProjects(
  db: AnyDatabase,
  organizationId: string,
  filters: { spaceId?: string | undefined; status?: string | undefined; includeArchived?: boolean },
) {
  const scope = withOrg(db, organizationId);

  const conditions = [
    filters.spaceId ? eq(schema.projects.spaceId, filters.spaceId) : undefined,
    filters.status
      ? eq(schema.projects.status, filters.status as 'active')
      : filters.includeArchived
        ? undefined
        : // Archived projects are hidden unless asked for; they are not deleted.
          sql`${schema.projects.status} <> 'archived'`,
  ];

  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      key: schema.projects.key,
      description: schema.projects.description,
      status: schema.projects.status,
      visibility: schema.projects.visibility,
      startDate: schema.projects.startDate,
      dueDate: schema.projects.dueDate,
      color: schema.projects.color,
      icon: schema.projects.icon,
      position: schema.projects.position,
      spaceId: schema.projects.spaceId,
      spaceName: schema.spaces.name,
      ownerId: schema.projects.ownerId,
      ownerName: schema.user.name,
      ownerImage: schema.user.image,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.projects.spaceId))
    .leftJoin(schema.user, eq(schema.user.id, schema.projects.ownerId))
    .where(scope.where(schema.projects, ...conditions))
    .orderBy(asc(schema.projects.position));
}

export async function getProject(db: AnyDatabase, organizationId: string, projectId: string) {
  const scope = withOrg(db, organizationId);

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, projectId)))
    .limit(1);

  if (!project) {
    // 404 rather than 403: whether a project exists in another tenant is not
    // information this caller is entitled to.
    throw new HTTPException(404, { message: 'No such project.' });
  }

  const statuses = await db
    .select()
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, projectId),
        eq(schema.taskStatuses.organizationId, organizationId),
      ),
    )
    .orderBy(asc(schema.taskStatuses.position));

  return { project, statuses };
}

export async function createProject(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateProjectInput,
) {
  const scope = withOrg(db, actor.organizationId);

  // The space must belong to the caller's organization. Without this check a
  // client could plant a project into another tenant's space by id.
  const [space] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(scope.where(schema.spaces, eq(schema.spaces.id, input.spaceId)))
    .limit(1);

  if (!space) {
    throw new HTTPException(404, { message: 'No such space.' });
  }

  const [duplicate] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(scope.whereIncludingDeleted(schema.projects, eq(schema.projects.key, input.key)))
    .limit(1);

  if (duplicate) {
    throw new HTTPException(409, {
      message: `The key ${input.key} is already used by another project.`,
    });
  }

  const [last] = await db
    .select({ position: schema.projects.position })
    .from(schema.projects)
    .where(scope.where(schema.projects))
    .orderBy(desc(schema.projects.position))
    .limit(1);

  const projectId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.projects).values(
      scope.values({
        id: projectId,
        spaceId: input.spaceId,
        name: input.name,
        key: input.key,
        description: input.description ?? null,
        status: input.status,
        visibility: input.visibility,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        ownerId: input.ownerId ?? actor.actorId,
        color: input.color ?? null,
        icon: input.icon ?? null,
        position: keyBetween(last?.position ?? null, null),
      }),
    );

    // A board with no columns is unusable, so every project starts with four.
    //
    // `keySequence`, not repeated `keyBetween` calls: the previous version
    // passed the loop index as if it were an ordering key, which produced
    // ["V", "W", "W", "X"] - two columns sharing a position. Postgres is then
    // free to return them in either order, and reordering against a tie throws.
    const statusPositions = keySequence(DEFAULT_STATUSES.length);

    await tx.insert(schema.taskStatuses).values(
      DEFAULT_STATUSES.map((status, index) =>
        scope.values({
          projectId,
          name: status.name,
          category: status.category,
          color: status.color,
          position: statusPositions[index] ?? keyBetween(null, null),
        }),
      ),
    );

    // The creator is a member of what they create, or they cannot open it.
    await tx.insert(schema.projectMembers).values(
      scope.values({
        projectId,
        userId: actor.actorId,
        role: 'manager',
      }),
    );

    await recordActivity(
      tx,
      auditEntry(actor, 'project.created', projectId, {
        name: { from: null, to: input.name },
      }),
    );

    return projectId;
  });
}

export async function updateProject(
  db: AnyDatabase,
  actor: ActorContext,
  projectId: string,
  input: UpdateProjectInput,
) {
  const scope = withOrg(db, actor.organizationId);

  const [existing] = await db
    .select()
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, projectId)))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'No such project.' });
  }

  // Record only what actually changed, so the audit log is readable.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, next] of Object.entries(input)) {
    const current = (existing as Record<string, unknown>)[field];
    if (next !== undefined && next !== current) {
      changes[field] = { from: current, to: next };
    }
  }

  if (Object.keys(changes).length === 0) {
    return existing;
  }

  return scope.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.projects)
      .set(input)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, auditEntry(actor, 'project.updated', projectId, changes));

    return updated;
  });
}

/**
 * Soft delete. The row stays, with `deletedAt` set, so Trash can restore it;
 * hard deletes happen only in the cleanup job.
 */
export async function deleteProject(db: AnyDatabase, actor: ActorContext, projectId: string) {
  const scope = withOrg(db, actor.organizationId);

  const [existing] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, projectId)))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'No such project.' });
  }

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(
      tx,
      auditEntry(actor, 'project.deleted', projectId, {
        deletedAt: { from: null, to: 'now' },
      }),
    );

    return { id: projectId };
  });
}

export async function restoreProject(db: AnyDatabase, actor: ActorContext, projectId: string) {
  const scope = withOrg(db, actor.organizationId);

  const [existing] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      scope.whereIncludingDeleted(
        schema.projects,
        eq(schema.projects.id, projectId),
        sql`${schema.projects.deletedAt} is not null`,
      ),
    )
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'No deleted project with that id.' });
  }

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({ deletedAt: null })
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(
      tx,
      auditEntry(actor, 'project.restored', projectId, {
        deletedAt: { from: 'set', to: null },
      }),
    );

    return { id: projectId };
  });
}

/** Everything in the caller's org that has been soft-deleted. */
export async function listTrashedProjects(db: AnyDatabase, organizationId: string) {
  const scope = withOrg(db, organizationId);

  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      key: schema.projects.key,
      deletedAt: schema.projects.deletedAt,
    })
    .from(schema.projects)
    .where(
      scope.whereIncludingDeleted(schema.projects, sql`${schema.projects.deletedAt} is not null`),
    )
    .orderBy(desc(schema.projects.deletedAt));
}

function auditEntry(
  actor: ActorContext,
  action: string,
  entityId: string,
  changes: Record<string, { from: unknown; to: unknown }>,
): AuditEntry {
  return {
    organizationId: actor.organizationId,
    actorId: actor.actorId,
    action,
    entityType: 'project',
    entityId,
    changes,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  };
}
