import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, keySequence, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import type { CommentToTaskInput, TaskToProjectInput } from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Promoting one thing into another.
 *
 * Both conversions **copy forward and link back**; neither moves or consumes
 * the source. A comment that became a task is still the comment someone wrote
 * in a thread that has to keep reading correctly, and a task promoted to a
 * project is still where the conversation happened. Consuming the source would
 * take the context with it, and there is no undo for that.
 *
 * The link back is a comment on the new object rather than a foreign key: the
 * relationship is a fact about how the work started, not something the product
 * needs to query.
 */

/** The first line of a comment, which is what a person would title it. */
function firstLine(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? '';
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

export async function commentToTask(
  db: AnyDatabase,
  actor: ActorContext,
  commentId: string,
  input: CommentToTaskInput,
) {
  const scope = withOrg(db, actor.organizationId);

  const [comment] = await db
    .select()
    .from(schema.comments)
    .where(scope.where(schema.comments, eq(schema.comments.id, commentId)))
    .limit(1);

  if (!comment) throw new HTTPException(404, { message: 'No such comment.' });

  if (comment.isTombstone) {
    throw new HTTPException(409, { message: 'That comment has been deleted.' });
  }

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, input.projectId)))
    .limit(1);

  if (!project) throw new HTTPException(404, { message: 'No such project.' });

  const title = input.title ?? firstLine(comment.bodyText);
  if (!title) {
    throw new HTTPException(400, {
      message: 'That comment has no text to use as a title. Give the task one.',
    });
  }

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

  // Assignees come from the request but must belong to this organization - the
  // client supplied the ids, so they are checked rather than trusted.
  const assigneeIds = input.assigneeIds ?? [];
  if (assigneeIds.length > 0) {
    const members = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(eq(schema.member.organizationId, actor.organizationId));

    const allowed = new Set(members.map((m) => m.userId));
    if (assigneeIds.some((id) => !allowed.has(id))) {
      throw new HTTPException(400, { message: 'One of those people is not in this workspace.' });
    }
  }

  const [lastTask] = await db
    .select({ position: schema.tasks.position })
    .from(schema.tasks)
    .where(
      scope.where(
        schema.tasks,
        eq(schema.tasks.projectId, input.projectId),
        isNull(schema.tasks.parentTaskId),
      ),
    )
    .orderBy(desc(schema.tasks.position))
    .limit(1);

  const taskId = newId();

  return scope.transaction(async (tx) => {
    // One locking statement, as in the tasks service: read-then-write would let
    // two concurrent conversions be handed the same ACME-7.
    const [bumped] = await tx
      .update(schema.projects)
      .set({ taskCounter: sql`${schema.projects.taskCounter} + 1` })
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, actor.organizationId),
        ),
      )
      .returning({ number: schema.projects.taskCounter });

    await tx.insert(schema.tasks).values(
      scope.values({
        id: taskId,
        projectId: input.projectId,
        number: bumped?.number ?? 1,
        title,
        descriptionText: comment.bodyText,
        description: comment.body,
        statusId,
        reporterId: actor.actorId,
        position: keyBetween(lastTask?.position ?? null, null),
      }),
    );

    if (assigneeIds.length > 0) {
      await tx.insert(schema.taskAssignees).values(
        assigneeIds.map((userId) =>
          scope.values({ taskId, userId, assignedById: actor.actorId }),
        ),
      );
    }

    // The link back, so the thread shows where the work went.
    await tx.insert(schema.comments).values(
      scope.values({
        entityType: 'task',
        entityId: taskId,
        authorId: actor.actorId,
        body: comment.body,
        bodyText: `Created from a comment.\n\n${comment.bodyText}`,
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.created-from-comment',
      entityType: 'task',
      entityId: taskId,
      changes: { fromComment: { from: null, to: commentId } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return taskId;
  });
}

export async function taskToProject(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  input: TaskToProjectInput,
) {
  const scope = withOrg(db, actor.organizationId);

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.id, taskId)))
    .limit(1);

  if (!task) throw new HTTPException(404, { message: 'No such task.' });

  const [space] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(scope.where(schema.spaces, eq(schema.spaces.id, input.spaceId)))
    .limit(1);

  if (!space) throw new HTTPException(404, { message: 'No such space.' });

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

  const subtasks = input.moveSubtasks
    ? await db
        .select({ id: schema.tasks.id, title: schema.tasks.title, priority: schema.tasks.priority })
        .from(schema.tasks)
        .where(scope.where(schema.tasks, eq(schema.tasks.parentTaskId, taskId)))
        .orderBy(asc(schema.tasks.position))
    : [];

  const [lastProject] = await db
    .select({ position: schema.projects.position })
    .from(schema.projects)
    .where(scope.where(schema.projects))
    .orderBy(desc(schema.projects.position))
    .limit(1);

  const projectId = newId();
  const columnIds = [newId(), newId(), newId(), newId()];
  const columnPositions = keySequence(4);
  const taskPositions = keySequence(subtasks.length);

  const DEFAULT_COLUMNS = [
    { name: 'Backlog', category: 'todo' as const, color: 'slate' },
    { name: 'In progress', category: 'in-progress' as const, color: 'indigo' },
    { name: 'In review', category: 'in-progress' as const, color: 'amber' },
    { name: 'Done', category: 'done' as const, color: 'green' },
  ];

  return scope.transaction(async (tx) => {
    await tx.insert(schema.projects).values(
      scope.values({
        id: projectId,
        spaceId: input.spaceId,
        name: input.name ?? task.title,
        key: input.key,
        description: task.descriptionText,
        status: 'planning',
        visibility: 'org',
        ownerId: actor.actorId,
        // The dates the task carried are the dates the project inherits.
        startDate: task.startDate,
        dueDate: task.dueDate,
        position: keyBetween(lastProject?.position ?? null, null),
        taskCounter: subtasks.length,
      }),
    );

    await tx.insert(schema.taskStatuses).values(
      DEFAULT_COLUMNS.map((column, index) =>
        scope.values({
          id: columnIds[index] ?? newId(),
          projectId,
          name: column.name,
          category: column.category,
          color: column.color,
          position: columnPositions[index] ?? keyBetween(null, null),
        }),
      ),
    );

    await tx
      .insert(schema.projectMembers)
      .values(scope.values({ projectId, userId: actor.actorId, role: 'manager' }));

    if (subtasks.length > 0) {
      // Subtasks *move*: they become the new project's top-level tasks. Copying
      // them would leave the same work in two places, which is the one outcome
      // nobody wants from "promote this to a project".
      for (const [index, subtask] of subtasks.entries()) {
        await tx
          .update(schema.tasks)
          .set({
            projectId,
            parentTaskId: null,
            statusId: columnIds[0] ?? null,
            number: index + 1,
            position: taskPositions[index] ?? keyBetween(null, null),
          })
          .where(
            and(
              eq(schema.tasks.id, subtask.id),
              eq(schema.tasks.organizationId, actor.organizationId),
            ),
          );
      }
    }

    // The source task stays put and says where the work went.
    await tx.insert(schema.comments).values(
      scope.values({
        entityType: 'task',
        entityId: taskId,
        authorId: actor.actorId,
        body: {},
        bodyText: `Promoted to the project ${input.key}.`,
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'project.created-from-task',
      entityType: 'project',
      entityId: projectId,
      changes: {
        fromTask: { from: null, to: taskId },
        movedSubtasks: { from: null, to: subtasks.length },
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return projectId;
  });
}
