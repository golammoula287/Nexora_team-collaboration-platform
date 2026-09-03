import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { schema, withOrg, type AnyDatabase } from '@nexora/db';
import { TRASH_RETENTION_DAYS, type BulkUpdateTasksInput } from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Operations over a selection of tasks: bulk edit, bulk delete, Trash.
 *
 * Two rules run through all of it:
 *
 *   - every id is re-scoped to the caller's organization BEFORE anything is
 *     written, and a selection containing a foreign id changes nothing rather
 *     than partially applying
 *   - one audit row per task, not one per batch, so "what happened to this
 *     task" stays answerable on the task itself
 */

/** Narrows a selection to the ids that really belong to this organization. */
async function ownedTaskIds(
  db: AnyDatabase,
  organizationId: string,
  taskIds: string[],
  includeDeleted = false,
) {
  const scope = withOrg(db, organizationId);

  const where = includeDeleted
    ? scope.whereIncludingDeleted(schema.tasks, inArray(schema.tasks.id, taskIds))
    : scope.where(schema.tasks, inArray(schema.tasks.id, taskIds));

  return db
    .select({
      id: schema.tasks.id,
      statusId: schema.tasks.statusId,
      priority: schema.tasks.priority,
      dueDate: schema.tasks.dueDate,
    })
    .from(schema.tasks)
    .where(where);
}

export async function bulkUpdateTasks(
  db: AnyDatabase,
  actor: ActorContext,
  input: BulkUpdateTasksInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const owned = await ownedTaskIds(db, actor.organizationId, input.taskIds);

  if (owned.length !== input.taskIds.length) {
    // All or nothing. A partially applied bulk edit is worse than a refusal:
    // the user cannot tell which half worked.
    throw new HTTPException(404, {
      message: 'Some of those tasks do not exist in this workspace.',
    });
  }

  const { addLabelIds, assigneeIds, ...columns } = input.patch;
  const patch: Record<string, unknown> = { ...columns };

  // Same rule as a single update: entering a done column completes the task.
  if (columns.statusId) {
    const [status] = await db
      .select({ category: schema.taskStatuses.category })
      .from(schema.taskStatuses)
      .where(
        and(
          eq(schema.taskStatuses.id, columns.statusId),
          eq(schema.taskStatuses.organizationId, actor.organizationId),
        ),
      )
      .limit(1);

    if (!status) throw new HTTPException(400, { message: 'No such status.' });
    patch.completedAt = status.category === 'done' ? new Date() : null;
  }

  const ids = owned.map((task) => task.id);

  return scope.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.tasks)
        .set(patch)
        .where(
          and(inArray(schema.tasks.id, ids), eq(schema.tasks.organizationId, actor.organizationId)),
        );
    }

    if (assigneeIds !== undefined) {
      await tx
        .delete(schema.taskAssignees)
        .where(
          and(
            inArray(schema.taskAssignees.taskId, ids),
            eq(schema.taskAssignees.organizationId, actor.organizationId),
          ),
        );
      if (assigneeIds.length > 0) {
        await tx
          .insert(schema.taskAssignees)
          .values(
            ids.flatMap((taskId) => assigneeIds.map((userId) => scope.values({ taskId, userId }))),
          );
      }
    }

    if (addLabelIds?.length) {
      // Adds rather than replaces: bulk-labelling a selection should not strip
      // the labels each task already carries.
      await tx
        .insert(schema.taskLabels)
        .values(
          ids.flatMap((taskId) => addLabelIds.map((labelId) => scope.values({ taskId, labelId }))),
        )
        .onConflictDoNothing();
    }

    for (const task of owned) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (columns.statusId) changes.statusId = { from: task.statusId, to: columns.statusId };
      if (columns.priority) changes.priority = { from: task.priority, to: columns.priority };
      if (columns.dueDate !== undefined) {
        changes.dueDate = { from: task.dueDate, to: columns.dueDate };
      }
      if (assigneeIds !== undefined) changes.assignees = { from: 'previous', to: assigneeIds };
      if (addLabelIds?.length) changes.labels = { from: 'previous', to: addLabelIds };

      await recordActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        action: 'task.bulk_updated',
        entityType: 'task',
        entityId: task.id,
        changes,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return { updated: ids.length };
  });
}

/** Soft-deletes a selection, subtasks included, in one transaction. */
export async function bulkDeleteTasks(db: AnyDatabase, actor: ActorContext, taskIds: string[]) {
  const scope = withOrg(db, actor.organizationId);
  const owned = await ownedTaskIds(db, actor.organizationId, taskIds);

  if (owned.length !== taskIds.length) {
    throw new HTTPException(404, {
      message: 'Some of those tasks do not exist in this workspace.',
    });
  }

  const ids = owned.map((task) => task.id);

  return scope.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(schema.tasks)
      .set({ deletedAt: now })
      .where(
        and(inArray(schema.tasks.id, ids), eq(schema.tasks.organizationId, actor.organizationId)),
      );

    // Subtasks go with their parent, or Trash restores a tree with no root.
    await tx
      .update(schema.tasks)
      .set({ deletedAt: now })
      .where(
        and(
          inArray(schema.tasks.parentTaskId, ids),
          eq(schema.tasks.organizationId, actor.organizationId),
        ),
      );

    for (const id of ids) {
      await recordActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        action: 'task.deleted',
        entityType: 'task',
        entityId: id,
        changes: { deletedAt: { from: null, to: 'now' } },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return { deleted: ids.length };
  });
}

/**
 * Trash: everything soft-deleted, newest first, with how long is left.
 *
 * Retention is TRASH_RETENTION_DAYS from `deletedAt`. The job that actually
 * removes them is phase 5 work; until then nothing is ever hard-deleted, which
 * is the safe direction to be wrong in.
 */
export async function listTrashedTasks(db: AnyDatabase, organizationId: string) {
  const scope = withOrg(db, organizationId);

  const rows = await db
    .select({
      id: schema.tasks.id,
      number: schema.tasks.number,
      title: schema.tasks.title,
      deletedAt: schema.tasks.deletedAt,
      projectId: schema.tasks.projectId,
      projectKey: schema.projects.key,
      parentTaskId: schema.tasks.parentTaskId,
    })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    .where(scope.whereIncludingDeleted(schema.tasks, sql`${schema.tasks.deletedAt} is not null`))
    .orderBy(desc(schema.tasks.deletedAt))
    .limit(500);

  return rows.map((row) => ({
    ...row,
    daysLeft: row.deletedAt
      ? Math.max(
          0,
          TRASH_RETENTION_DAYS - Math.floor((Date.now() - row.deletedAt.getTime()) / 86_400_000),
        )
      : TRASH_RETENTION_DAYS,
  }));
}

/** Restores soft-deleted tasks, and the subtasks that went down with them. */
export async function restoreTasks(db: AnyDatabase, actor: ActorContext, taskIds: string[]) {
  const scope = withOrg(db, actor.organizationId);

  const owned = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      scope.whereIncludingDeleted(
        schema.tasks,
        inArray(schema.tasks.id, taskIds),
        sql`${schema.tasks.deletedAt} is not null`,
      ),
    );

  if (owned.length === 0) {
    throw new HTTPException(404, { message: 'Nothing to restore.' });
  }

  const ids = owned.map((task) => task.id);

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.tasks)
      .set({ deletedAt: null })
      .where(
        and(inArray(schema.tasks.id, ids), eq(schema.tasks.organizationId, actor.organizationId)),
      );

    // Mirrors the delete: subtasks come back with their parent.
    await tx
      .update(schema.tasks)
      .set({ deletedAt: null })
      .where(
        and(
          inArray(schema.tasks.parentTaskId, ids),
          eq(schema.tasks.organizationId, actor.organizationId),
        ),
      );

    for (const id of ids) {
      await recordActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        action: 'task.restored',
        entityType: 'task',
        entityId: id,
        changes: { deletedAt: { from: 'set', to: null } },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return { restored: ids.length };
  });
}
