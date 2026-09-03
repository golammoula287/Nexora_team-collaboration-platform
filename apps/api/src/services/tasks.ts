import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, newId, schema, withOrg, type AnyDatabase, type Transaction } from '@nexora/db';
import type {
  CreateDependencyInput,
  CreateTaskInput,
  MoveTaskInput,
  UpdateTaskInput,
} from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Tasks.
 *
 * Three things here are worth more attention than the CRUD around them:
 *
 *   - the per-project number (ACME-123) has to be race-free
 *   - subtasks and dependencies are graphs, so both need cycle detection
 *   - the change log records fields, not rows
 */

/** Confirms the task exists in the caller's org, and returns it. */
async function requireTask(db: AnyDatabase, organizationId: string, taskId: string) {
  const scope = withOrg(db, organizationId);

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.id, taskId)))
    .limit(1);

  if (!task) {
    // 404 for "not yours" as well as "does not exist" - the difference is not
    // information this caller is entitled to.
    throw new HTTPException(404, { message: 'No such task.' });
  }
  return task;
}

/**
 * The next number for a project, allocated atomically.
 *
 * `UPDATE ... SET n = n + 1 RETURNING n` takes a row lock, so two concurrent
 * creates cannot receive the same number. Reading the counter and writing it
 * back separately would let them.
 */
async function nextTaskNumber(
  tx: Transaction,
  organizationId: string,
  projectId: string,
): Promise<number> {
  const [row] = await tx
    .update(schema.projects)
    .set({ taskCounter: sql`${schema.projects.taskCounter} + 1` })
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)),
    )
    .returning({ number: schema.projects.taskCounter });

  if (!row) throw new HTTPException(404, { message: 'No such project.' });
  return row.number;
}

/**
 * Would making `childId` a subtask of `parentId` create a loop?
 *
 * Walks up from the proposed parent; if we reach the child, the move would
 * make the task its own ancestor. A recursive CTE does this in one round trip
 * and cannot be defeated by a deep tree.
 */
async function wouldCycleInTree(
  db: AnyDatabase,
  organizationId: string,
  childId: string,
  parentId: string,
): Promise<boolean> {
  if (childId === parentId) return true;

  const result = (await db.execute(sql`
    with recursive ancestors as (
      select id, parent_task_id
      from tasks
      where id = ${parentId} and organization_id = ${organizationId}
      union all
      select t.id, t.parent_task_id
      from tasks t
      join ancestors a on t.id = a.parent_task_id
      where t.organization_id = ${organizationId}
    )
    select count(*)::int as found from ancestors where id = ${childId}
  `)) as { rows: { found: number }[] };

  return (result.rows[0]?.found ?? 0) > 0;
}

/**
 * Would "A blocks B" create a loop in the dependency graph?
 *
 * Postgres will not catch this for us: the constraint is on the graph, not on
 * any row. A cycle means a set of tasks that can never start.
 */
async function wouldCycleInDependencies(
  db: AnyDatabase,
  organizationId: string,
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  if (taskId === dependsOnTaskId) return true;

  const result = (await db.execute(sql`
    with recursive chain as (
      select depends_on_task_id as id
      from task_dependencies
      where task_id = ${dependsOnTaskId}
        and organization_id = ${organizationId}
        and type = 'blocks'
      union all
      select d.depends_on_task_id
      from task_dependencies d
      join chain c on d.task_id = c.id
      where d.organization_id = ${organizationId} and d.type = 'blocks'
    )
    select count(*)::int as found from chain where id = ${taskId}
  `)) as { rows: { found: number }[] };

  return (result.rows[0]?.found ?? 0) > 0;
}

export async function listTasks(
  db: AnyDatabase,
  organizationId: string,
  filters: {
    projectId?: string | undefined;
    statusId?: string | undefined;
    assigneeId?: string | undefined;
    parentTaskId?: string | undefined;
    topLevelOnly?: boolean | undefined;
    search?: string | undefined;
  },
) {
  const scope = withOrg(db, organizationId);

  const conditions = [
    filters.projectId ? eq(schema.tasks.projectId, filters.projectId) : undefined,
    filters.statusId ? eq(schema.tasks.statusId, filters.statusId) : undefined,
    filters.parentTaskId ? eq(schema.tasks.parentTaskId, filters.parentTaskId) : undefined,
    filters.topLevelOnly ? sql`${schema.tasks.parentTaskId} is null` : undefined,
    // Trigram index on title makes this cheap; the filter is still in the SQL.
    filters.search ? sql`${schema.tasks.title} ilike ${'%' + filters.search + '%'}` : undefined,
    filters.assigneeId
      ? sql`exists (
          select 1 from ${schema.taskAssignees}
          where ${schema.taskAssignees.taskId} = ${schema.tasks.id}
            and ${schema.taskAssignees.userId} = ${filters.assigneeId}
        )`
      : undefined,
  ];

  const tasks = await db
    .select({
      id: schema.tasks.id,
      number: schema.tasks.number,
      title: schema.tasks.title,
      descriptionText: schema.tasks.descriptionText,
      priority: schema.tasks.priority,
      statusId: schema.tasks.statusId,
      statusName: schema.taskStatuses.name,
      statusCategory: schema.taskStatuses.category,
      projectId: schema.tasks.projectId,
      projectKey: schema.projects.key,
      parentTaskId: schema.tasks.parentTaskId,
      startDate: schema.tasks.startDate,
      dueDate: schema.tasks.dueDate,
      estimateMinutes: schema.tasks.estimateMinutes,
      completedAt: schema.tasks.completedAt,
      position: schema.tasks.position,
      createdAt: schema.tasks.createdAt,
    })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    .leftJoin(schema.taskStatuses, eq(schema.taskStatuses.id, schema.tasks.statusId))
    .where(scope.where(schema.tasks, ...conditions))
    .orderBy(asc(schema.tasks.position))
    .limit(500);

  if (tasks.length === 0) return [];

  // Assignees in one extra query rather than one per task.
  const ids = tasks.map((task) => task.id);
  const assignees = await db
    .select({
      taskId: schema.taskAssignees.taskId,
      userId: schema.user.id,
      name: schema.user.name,
      image: schema.user.image,
    })
    .from(schema.taskAssignees)
    .innerJoin(schema.user, eq(schema.user.id, schema.taskAssignees.userId))
    .where(
      and(
        inArray(schema.taskAssignees.taskId, ids),
        eq(schema.taskAssignees.organizationId, organizationId),
      ),
    );

  const byTask = new Map<string, { userId: string; name: string; image: string | null }[]>();
  for (const row of assignees) {
    const list = byTask.get(row.taskId) ?? [];
    list.push({ userId: row.userId, name: row.name, image: row.image });
    byTask.set(row.taskId, list);
  }

  return tasks.map((task) => ({ ...task, assignees: byTask.get(task.id) ?? [] }));
}

export async function getTask(db: AnyDatabase, organizationId: string, taskId: string) {
  const task = await requireTask(db, organizationId, taskId);
  const scope = withOrg(db, organizationId);

  const [subtasks, dependencies, assignees, history] = await Promise.all([
    db
      .select({
        id: schema.tasks.id,
        number: schema.tasks.number,
        title: schema.tasks.title,
        completedAt: schema.tasks.completedAt,
        position: schema.tasks.position,
      })
      .from(schema.tasks)
      .where(scope.where(schema.tasks, eq(schema.tasks.parentTaskId, taskId)))
      .orderBy(asc(schema.tasks.position)),

    db
      .select({
        id: schema.taskDependencies.id,
        type: schema.taskDependencies.type,
        dependsOnTaskId: schema.taskDependencies.dependsOnTaskId,
        dependsOnTitle: schema.tasks.title,
        dependsOnNumber: schema.tasks.number,
        dependsOnCompletedAt: schema.tasks.completedAt,
        dependsOnDueDate: schema.tasks.dueDate,
      })
      .from(schema.taskDependencies)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.dependsOnTaskId))
      .where(
        and(
          eq(schema.taskDependencies.taskId, taskId),
          eq(schema.taskDependencies.organizationId, organizationId),
        ),
      ),

    db
      .select({ userId: schema.user.id, name: schema.user.name, image: schema.user.image })
      .from(schema.taskAssignees)
      .innerJoin(schema.user, eq(schema.user.id, schema.taskAssignees.userId))
      .where(
        and(
          eq(schema.taskAssignees.taskId, taskId),
          eq(schema.taskAssignees.organizationId, organizationId),
        ),
      ),

    // The per-field change log the plan calls for: it is the audit rows for
    // this entity, read back.
    db
      .select({
        id: schema.activities.id,
        action: schema.activities.action,
        changes: schema.activities.changes,
        createdAt: schema.activities.createdAt,
        actorId: schema.activities.actorId,
        actorName: schema.user.name,
      })
      .from(schema.activities)
      .leftJoin(schema.user, eq(schema.user.id, schema.activities.actorId))
      .where(
        and(
          eq(schema.activities.entityType, 'task'),
          eq(schema.activities.entityId, taskId),
          eq(schema.activities.organizationId, organizationId),
        ),
      )
      .orderBy(desc(schema.activities.createdAt))
      .limit(50),
  ]);

  /**
   * A blocker that slipped past this task's due date is worth flagging - the
   * plan asks for a warning when a blocker moves.
   */
  const blockedBySlipped = dependencies.some(
    (dependency) =>
      dependency.type === 'blocks' &&
      dependency.dependsOnCompletedAt === null &&
      task.dueDate !== null &&
      dependency.dependsOnDueDate !== null &&
      dependency.dependsOnDueDate > task.dueDate,
  );

  return { task, subtasks, dependencies, assignees, history, blockedBySlipped };
}

export async function createTask(db: AnyDatabase, actor: ActorContext, input: CreateTaskInput) {
  const scope = withOrg(db, actor.organizationId);

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, input.projectId)))
    .limit(1);

  if (!project) throw new HTTPException(404, { message: 'No such project.' });

  if (input.parentTaskId) {
    const parent = await requireTask(db, actor.organizationId, input.parentTaskId);
    if (parent.projectId !== input.projectId) {
      throw new HTTPException(400, {
        message: 'A subtask must live in the same project as its parent.',
      });
    }
  }

  // Default to the project's first column so a new task is never orphaned off
  // the board.
  let statusId = input.statusId ?? null;
  if (!statusId) {
    const [first] = await db
      .select({ id: schema.taskStatuses.id })
      .from(schema.taskStatuses)
      .where(
        and(
          eq(schema.taskStatuses.projectId, input.projectId),
          eq(schema.taskStatuses.organizationId, actor.organizationId),
        ),
      )
      .orderBy(asc(schema.taskStatuses.position))
      .limit(1);
    statusId = first?.id ?? null;
  }

  const position = await positionFor(db, actor.organizationId, {
    projectId: input.projectId,
    statusId,
    parentTaskId: input.parentTaskId ?? null,
    afterTaskId: input.afterTaskId ?? null,
  });

  const taskId = newId();

  return scope.transaction(async (tx) => {
    const number = await nextTaskNumber(tx, actor.organizationId, input.projectId);

    await tx.insert(schema.tasks).values(
      scope.values({
        id: taskId,
        projectId: input.projectId,
        parentTaskId: input.parentTaskId ?? null,
        number,
        title: input.title,
        descriptionText: input.description ?? null,
        statusId,
        priority: input.priority,
        reporterId: actor.actorId,
        sprintId: input.sprintId ?? null,
        milestoneId: input.milestoneId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        position,
      }),
    );

    if (input.assigneeIds?.length) {
      await tx
        .insert(schema.taskAssignees)
        .values(input.assigneeIds.map((userId) => scope.values({ taskId, userId })));
    }

    if (input.labelIds?.length) {
      await tx
        .insert(schema.taskLabels)
        .values(input.labelIds.map((labelId) => scope.values({ taskId, labelId })));
    }

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.created',
      entityType: 'task',
      entityId: taskId,
      changes: { title: { from: null, to: input.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { id: taskId, number };
  });
}

/** Where a new or moved task sits, as a fractional index between neighbours. */
async function positionFor(
  db: AnyDatabase,
  organizationId: string,
  location: {
    projectId: string;
    statusId: string | null;
    parentTaskId: string | null;
    afterTaskId?: string | null;
    beforeTaskId?: string | null;
  },
): Promise<string> {
  const scope = withOrg(db, organizationId);

  const neighbourPosition = async (taskId: string | null | undefined) => {
    if (!taskId) return null;
    const [row] = await db
      .select({ position: schema.tasks.position })
      .from(schema.tasks)
      .where(scope.where(schema.tasks, eq(schema.tasks.id, taskId)))
      .limit(1);
    return row?.position ?? null;
  };

  const after = await neighbourPosition(location.afterTaskId);
  const before = await neighbourPosition(location.beforeTaskId);

  if (after || before) return keyBetween(after, before);

  // No neighbours given: append to the end of the column.
  const [last] = await db
    .select({ position: schema.tasks.position })
    .from(schema.tasks)
    .where(
      scope.where(
        schema.tasks,
        eq(schema.tasks.projectId, location.projectId),
        location.statusId ? eq(schema.tasks.statusId, location.statusId) : undefined,
        location.parentTaskId
          ? eq(schema.tasks.parentTaskId, location.parentTaskId)
          : sql`${schema.tasks.parentTaskId} is null`,
      ),
    )
    .orderBy(desc(schema.tasks.position))
    .limit(1);

  return keyBetween(last?.position ?? null, null);
}

export async function updateTask(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  input: UpdateTaskInput,
) {
  const existing = await requireTask(db, actor.organizationId, taskId);
  const scope = withOrg(db, actor.organizationId);

  if (input.parentTaskId) {
    if (await wouldCycleInTree(db, actor.organizationId, taskId, input.parentTaskId)) {
      throw new HTTPException(409, {
        message: 'That would make the task its own subtask.',
      });
    }
  }

  const { assigneeIds, labelIds, ...columns } = input;

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, next] of Object.entries(columns)) {
    const current = (existing as Record<string, unknown>)[field];
    if (next !== undefined && next !== current) changes[field] = { from: current, to: next };
  }

  // Moving into or out of a "done" column is what completes a task, so the
  // timestamp follows the status rather than being set separately.
  const patch: Record<string, unknown> = { ...columns };
  if (columns.statusId !== undefined && columns.statusId !== null) {
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

    if (!status) throw new HTTPException(400, { message: 'No such status in this project.' });

    const nowDone = status.category === 'done';
    if (nowDone && !existing.completedAt) {
      patch.completedAt = new Date();
      changes.completedAt = { from: null, to: 'now' };
    } else if (!nowDone && existing.completedAt) {
      patch.completedAt = null;
      changes.completedAt = { from: existing.completedAt, to: null };
    }
  }

  if (assigneeIds !== undefined) changes.assignees = { from: 'previous', to: assigneeIds };
  if (labelIds !== undefined) changes.labels = { from: 'previous', to: labelIds };

  if (Object.keys(changes).length === 0) return existing;

  return scope.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.tasks)
        .set(patch)
        .where(
          and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, actor.organizationId)),
        );
    }

    if (assigneeIds !== undefined) {
      await tx
        .delete(schema.taskAssignees)
        .where(
          and(
            eq(schema.taskAssignees.taskId, taskId),
            eq(schema.taskAssignees.organizationId, actor.organizationId),
          ),
        );
      if (assigneeIds.length > 0) {
        await tx
          .insert(schema.taskAssignees)
          .values(assigneeIds.map((userId) => scope.values({ taskId, userId })));
      }
    }

    if (labelIds !== undefined) {
      await tx
        .delete(schema.taskLabels)
        .where(
          and(
            eq(schema.taskLabels.taskId, taskId),
            eq(schema.taskLabels.organizationId, actor.organizationId),
          ),
        );
      if (labelIds.length > 0) {
        await tx
          .insert(schema.taskLabels)
          .values(labelIds.map((labelId) => scope.values({ taskId, labelId })));
      }
    }

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.updated',
      entityType: 'task',
      entityId: taskId,
      changes,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    const [updated] = await tx.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    return updated;
  });
}

/** A drag. Writes one row: the task's own position, and possibly its column. */
export async function moveTask(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  input: MoveTaskInput,
) {
  const existing = await requireTask(db, actor.organizationId, taskId);
  const scope = withOrg(db, actor.organizationId);

  const position = await positionFor(db, actor.organizationId, {
    projectId: existing.projectId,
    statusId: input.statusId ?? existing.statusId,
    parentTaskId: existing.parentTaskId,
    afterTaskId: input.afterTaskId ?? null,
    beforeTaskId: input.beforeTaskId ?? null,
  });

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.tasks)
      .set({
        position,
        ...(input.statusId !== undefined ? { statusId: input.statusId } : {}),
      })
      .where(
        and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, actor.organizationId)),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.moved',
      entityType: 'task',
      entityId: taskId,
      changes: {
        position: { from: existing.position, to: position },
        ...(input.statusId !== undefined
          ? { statusId: { from: existing.statusId, to: input.statusId } }
          : {}),
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { id: taskId, position };
  });
}

export async function addDependency(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  input: CreateDependencyInput,
) {
  await requireTask(db, actor.organizationId, taskId);
  await requireTask(db, actor.organizationId, input.dependsOnTaskId);

  if (taskId === input.dependsOnTaskId) {
    throw new HTTPException(409, { message: 'A task cannot depend on itself.' });
  }

  if (
    input.type === 'blocks' &&
    (await wouldCycleInDependencies(db, actor.organizationId, taskId, input.dependsOnTaskId))
  ) {
    // A cycle means a set of tasks none of which can ever start.
    throw new HTTPException(409, {
      message: 'That dependency would create a loop.',
    });
  }

  const scope = withOrg(db, actor.organizationId);

  return scope.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.taskDependencies)
      .values(
        scope.values({
          taskId,
          dependsOnTaskId: input.dependsOnTaskId,
          type: input.type,
        }),
      )
      .onConflictDoNothing()
      .returning({ id: schema.taskDependencies.id });

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.dependency_added',
      entityType: 'task',
      entityId: taskId,
      changes: { dependsOn: { from: null, to: input.dependsOnTaskId } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { id: row?.id ?? null };
  });
}

export async function deleteTask(db: AnyDatabase, actor: ActorContext, taskId: string) {
  await requireTask(db, actor.organizationId, taskId);
  const scope = withOrg(db, actor.organizationId);

  return scope.transaction(async (tx) => {
    // Soft delete. Subtasks go with the parent, or Trash would restore an
    // orphaned tree.
    const now = new Date();
    await tx
      .update(schema.tasks)
      .set({ deletedAt: now })
      .where(
        and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, actor.organizationId)),
      );
    await tx
      .update(schema.tasks)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.tasks.parentTaskId, taskId),
          eq(schema.tasks.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.deleted',
      entityType: 'task',
      entityId: taskId,
      changes: { deletedAt: { from: null, to: 'now' } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { id: taskId };
  });
}
