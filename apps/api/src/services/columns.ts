import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import type { CreateColumnInput, MoveColumnInput, UpdateColumnInput } from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Board columns.
 *
 * Columns are `task_statuses` rows: project configuration rather than content,
 * so they hard-delete rather than going to Trash. That makes deletion the only
 * interesting operation here - `tasks.status_id` is `ON DELETE SET NULL`, so a
 * naive delete would leave its cards with no column, visible in no view and
 * recoverable only from the database. The caller must name the column that
 * inherits them.
 */

async function requireProject(db: AnyDatabase, organizationId: string, projectId: string) {
  const scope = withOrg(db, organizationId);

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, projectId)))
    .limit(1);

  if (!project) throw new HTTPException(404, { message: 'No such project.' });
  return project;
}

async function requireColumn(db: AnyDatabase, organizationId: string, columnId: string) {
  const [column] = await db
    .select()
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.id, columnId),
        eq(schema.taskStatuses.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!column) throw new HTTPException(404, { message: 'No such column.' });
  return column;
}

export async function listColumns(db: AnyDatabase, organizationId: string, projectId: string) {
  await requireProject(db, organizationId, projectId);

  return db
    .select({
      id: schema.taskStatuses.id,
      name: schema.taskStatuses.name,
      category: schema.taskStatuses.category,
      color: schema.taskStatuses.color,
      wipLimit: schema.taskStatuses.wipLimit,
      position: schema.taskStatuses.position,
    })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, projectId),
        eq(schema.taskStatuses.organizationId, organizationId),
      ),
    )
    .orderBy(asc(schema.taskStatuses.position));
}

export async function createColumn(
  db: AnyDatabase,
  actor: ActorContext,
  projectId: string,
  input: CreateColumnInput,
) {
  const scope = withOrg(db, actor.organizationId);
  await requireProject(db, actor.organizationId, projectId);

  const columns = await listColumns(db, actor.organizationId, projectId);

  // Append by default; otherwise slot in after the named column.
  const index = input.afterColumnId
    ? columns.findIndex((column) => column.id === input.afterColumnId)
    : columns.length - 1;

  const before = index >= 0 ? (columns[index]?.position ?? null) : null;
  const after = index >= 0 ? (columns[index + 1]?.position ?? null) : (columns[0]?.position ?? null);

  const columnId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.taskStatuses).values(
      scope.values({
        id: columnId,
        projectId,
        name: input.name,
        category: input.category,
        color: input.color ?? null,
        wipLimit: input.wipLimit ?? null,
        position: keyBetween(before, after),
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'column.created',
      entityType: 'project',
      entityId: projectId,
      changes: { name: { from: null, to: input.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return columnId;
  });
}

export async function updateColumn(
  db: AnyDatabase,
  actor: ActorContext,
  columnId: string,
  input: UpdateColumnInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireColumn(db, actor.organizationId, columnId);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, next] of Object.entries(input)) {
    const current = (existing as Record<string, unknown>)[field];
    if (next !== undefined && next !== current) changes[field] = { from: current, to: next };
  }

  if (Object.keys(changes).length === 0) return existing;

  return scope.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.taskStatuses)
      .set(input)
      .where(
        and(
          eq(schema.taskStatuses.id, columnId),
          eq(schema.taskStatuses.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'column.updated',
      entityType: 'project',
      entityId: existing.projectId,
      changes,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}

export async function moveColumn(
  db: AnyDatabase,
  actor: ActorContext,
  columnId: string,
  input: MoveColumnInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const column = await requireColumn(db, actor.organizationId, columnId);

  // Neighbours, exactly as for a task: the server derives the key so two people
  // reordering at once cannot write conflicting positions.
  const neighbours = await db
    .select({ id: schema.taskStatuses.id, position: schema.taskStatuses.position })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, column.projectId),
        eq(schema.taskStatuses.organizationId, actor.organizationId),
      ),
    );

  const positionOf = (id: string | null | undefined) =>
    id ? (neighbours.find((n) => n.id === id)?.position ?? null) : null;

  const position = keyBetween(positionOf(input.afterColumnId), positionOf(input.beforeColumnId));

  return scope.transaction(async (tx) => {
    const [moved] = await tx
      .update(schema.taskStatuses)
      .set({ position })
      .where(
        and(
          eq(schema.taskStatuses.id, columnId),
          eq(schema.taskStatuses.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'column.moved',
      entityType: 'project',
      entityId: column.projectId,
      changes: { position: { from: column.position, to: position } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return moved;
  });
}

export async function deleteColumn(
  db: AnyDatabase,
  actor: ActorContext,
  columnId: string,
  moveTasksToColumnId?: string,
) {
  const scope = withOrg(db, actor.organizationId);
  const column = await requireColumn(db, actor.organizationId, columnId);

  const [remaining] = await db
    .select({ total: count() })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, column.projectId),
        eq(schema.taskStatuses.organizationId, actor.organizationId),
        ne(schema.taskStatuses.id, columnId),
      ),
    );

  if ((remaining?.total ?? 0) === 0) {
    throw new HTTPException(409, {
      message: 'A project needs at least one column.',
    });
  }

  const [held] = await db
    .select({ total: count() })
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.statusId, columnId)));

  const holding = held?.total ?? 0;

  if (holding > 0) {
    if (!moveTasksToColumnId) {
      // Refuse rather than orphan. `tasks.status_id` is ON DELETE SET NULL, so
      // the cards would survive in no column at all.
      throw new HTTPException(409, {
        message: `That column holds ${holding} task${holding === 1 ? '' : 's'}. Choose a column to move them to.`,
      });
    }

    const target = await requireColumn(db, actor.organizationId, moveTasksToColumnId);
    if (target.projectId !== column.projectId) {
      throw new HTTPException(400, { message: 'Move the tasks to a column in the same project.' });
    }
  }

  return scope.transaction(async (tx) => {
    if (holding > 0 && moveTasksToColumnId) {
      await tx
        .update(schema.tasks)
        .set({ statusId: moveTasksToColumnId })
        .where(
          and(
            eq(schema.tasks.statusId, columnId),
            eq(schema.tasks.organizationId, actor.organizationId),
          ),
        );
    }

    await tx
      .delete(schema.taskStatuses)
      .where(
        and(
          eq(schema.taskStatuses.id, columnId),
          eq(schema.taskStatuses.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'column.deleted',
      entityType: 'project',
      entityId: column.projectId,
      changes: {
        name: { from: column.name, to: null },
        movedTasks: { from: null, to: holding },
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { deleted: 1, movedTasks: holding };
  });
}

/** Used by project duplication and templates, which need the same ordering. */
export async function columnsForCopy(
  db: AnyDatabase,
  organizationId: string,
  projectId: string,
): Promise<{ name: string; category: string; color: string | null; wipLimit: number | null }[]> {
  const columns = await db
    .select({
      name: schema.taskStatuses.name,
      category: schema.taskStatuses.category,
      color: schema.taskStatuses.color,
      wipLimit: schema.taskStatuses.wipLimit,
    })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, projectId),
        eq(schema.taskStatuses.organizationId, organizationId),
      ),
    )
    .orderBy(asc(schema.taskStatuses.position));

  return columns;
}

/** The last column's position, for appending. */
export async function lastColumnPosition(
  db: AnyDatabase,
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const [last] = await db
    .select({ position: schema.taskStatuses.position })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, projectId),
        eq(schema.taskStatuses.organizationId, organizationId),
      ),
    )
    .orderBy(desc(schema.taskStatuses.position))
    .limit(1);

  return last?.position ?? null;
}
