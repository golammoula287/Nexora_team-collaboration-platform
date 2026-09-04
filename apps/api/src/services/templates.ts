import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import {
  keyBetween,
  keySequence,
  newId,
  schema,
  withOrg,
  type AnyDatabase,
  type Transaction,
} from '@nexora/db';
import {
  projectTemplatePayloadSchema,
  taskTemplatePayloadSchema,
  type ApplyProjectTemplateInput,
  type ApplyTaskTemplateInput,
  type CreateProjectTemplateInput,
  type CreateTaskTemplateInput,
  type DuplicateProjectInput,
  type ProjectTemplatePayload,
  type TaskTemplatePayload,
} from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Templates and duplication.
 *
 * A template is a **snapshot**, not a live link. Applying one copies values in
 * and then forgets where they came from, so editing a template never reaches
 * back into work already created from it - which is what people assume, and
 * what a live reference would violate at the worst possible moment.
 *
 * The payload is `jsonb`, so it is Zod-parsed on the way out. A template row is
 * data like any other; casting it would let a hand-edited row build half a
 * project and then fail somewhere unhelpful.
 */

async function requireProject(db: AnyDatabase, organizationId: string, projectId: string) {
  const scope = withOrg(db, organizationId);

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(scope.where(schema.projects, eq(schema.projects.id, projectId)))
    .limit(1);

  if (!project) throw new HTTPException(404, { message: 'No such project.' });
  return project;
}

async function requireTemplate(db: AnyDatabase, organizationId: string, templateId: string) {
  const scope = withOrg(db, organizationId);

  const [template] = await db
    .select()
    .from(schema.templates)
    .where(scope.where(schema.templates, eq(schema.templates.id, templateId)))
    .limit(1);

  if (!template) throw new HTTPException(404, { message: 'No such template.' });
  return template;
}

async function requireUnusedKey(db: AnyDatabase, organizationId: string, key: string) {
  const scope = withOrg(db, organizationId);

  const [duplicate] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    // Including deleted: a key belonging to a trashed project is still taken,
    // because restoring it would collide.
    .where(scope.whereIncludingDeleted(schema.projects, eq(schema.projects.key, key)))
    .limit(1);

  if (duplicate) {
    throw new HTTPException(409, { message: `The key ${key} is already used by another project.` });
  }
}

export async function listTemplates(db: AnyDatabase, organizationId: string, kind?: string) {
  const scope = withOrg(db, organizationId);

  return db
    .select({
      id: schema.templates.id,
      kind: schema.templates.kind,
      name: schema.templates.name,
      description: schema.templates.description,
      createdById: schema.templates.createdById,
      createdByName: schema.user.name,
      createdAt: schema.templates.createdAt,
    })
    .from(schema.templates)
    .leftJoin(schema.user, eq(schema.user.id, schema.templates.createdById))
    .where(scope.where(schema.templates, kind ? eq(schema.templates.kind, kind) : undefined))
    .orderBy(desc(schema.templates.createdAt));
}

// --- Saving -----------------------------------------------------------------

export async function createTaskTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateTaskTemplateInput,
) {
  const scope = withOrg(db, actor.organizationId);

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.id, input.taskId)))
    .limit(1);

  if (!task) throw new HTTPException(404, { message: 'No such task.' });

  const subtasks = await db
    .select({ title: schema.tasks.title, priority: schema.tasks.priority })
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.parentTaskId, input.taskId)))
    .orderBy(asc(schema.tasks.position));

  const checklists = await db
    .select({ id: schema.checklists.id, title: schema.checklists.title })
    .from(schema.checklists)
    .where(scope.where(schema.checklists, eq(schema.checklists.taskId, input.taskId)))
    .orderBy(asc(schema.checklists.position));

  const items = await db
    .select({
      checklistId: schema.checklistItems.checklistId,
      title: schema.checklistItems.title,
    })
    .from(schema.checklistItems)
    .innerJoin(schema.checklists, eq(schema.checklists.id, schema.checklistItems.checklistId))
    .where(
      scope.where(schema.checklistItems, eq(schema.checklists.taskId, input.taskId)),
    )
    .orderBy(asc(schema.checklistItems.position));

  const payload: TaskTemplatePayload = {
    title: task.title,
    description: task.descriptionText,
    priority: task.priority,
    estimateMinutes: task.estimateMinutes,
    checklists: checklists.map((checklist) => ({
      title: checklist.title,
      items: items.filter((item) => item.checklistId === checklist.id).map((item) => item.title),
    })),
    subtasks,
  };

  const templateId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.templates).values(
      scope.values({
        id: templateId,
        kind: 'task',
        name: input.name,
        description: input.description ?? null,
        payload,
        createdById: actor.actorId,
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'template.created',
      entityType: 'task',
      entityId: input.taskId,
      changes: { name: { from: null, to: input.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return templateId;
  });
}

export async function createProjectTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateProjectTemplateInput,
) {
  const scope = withOrg(db, actor.organizationId);
  await requireProject(db, actor.organizationId, input.projectId);

  const columns = await db
    .select({
      id: schema.taskStatuses.id,
      name: schema.taskStatuses.name,
      category: schema.taskStatuses.category,
      color: schema.taskStatuses.color,
      wipLimit: schema.taskStatuses.wipLimit,
    })
    .from(schema.taskStatuses)
    .where(
      and(
        eq(schema.taskStatuses.projectId, input.projectId),
        eq(schema.taskStatuses.organizationId, actor.organizationId),
      ),
    )
    .orderBy(asc(schema.taskStatuses.position));

  const payload: ProjectTemplatePayload = { columns, tasks: [] };

  if (input.includeTasks) {
    const tasks = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        priority: schema.tasks.priority,
        statusId: schema.tasks.statusId,
        parentTaskId: schema.tasks.parentTaskId,
      })
      .from(schema.tasks)
      .where(scope.where(schema.tasks, eq(schema.tasks.projectId, input.projectId)))
      .orderBy(asc(schema.tasks.position));

    const topLevel = tasks.filter((task) => task.parentTaskId === null);

    payload.tasks = topLevel.map((task) => ({
      title: task.title,
      priority: task.priority,
      // By index, not by id: the template outlives the project it came from,
      // and a copied column has a different id.
      columnIndex: Math.max(
        0,
        columns.findIndex((column) => column.id === task.statusId),
      ),
      subtasks: tasks
        .filter((child) => child.parentTaskId === task.id)
        .map((child) => ({ title: child.title, priority: child.priority })),
    }));
  }

  const templateId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.templates).values(
      scope.values({
        id: templateId,
        kind: 'project',
        name: input.name,
        description: input.description ?? null,
        payload,
        createdById: actor.actorId,
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'template.created',
      entityType: 'project',
      entityId: input.projectId,
      changes: { name: { from: null, to: input.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return templateId;
  });
}

export async function deleteTemplate(db: AnyDatabase, actor: ActorContext, templateId: string) {
  const scope = withOrg(db, actor.organizationId);
  const template = await requireTemplate(db, actor.organizationId, templateId);

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.templates)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.templates.id, templateId),
          eq(schema.templates.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'template.deleted',
      entityType: 'organization',
      entityId: actor.organizationId,
      changes: { name: { from: template.name, to: null } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { deleted: 1 };
  });
}

// --- Applying ---------------------------------------------------------------

/**
 * The next `n` task numbers for a project, allocated in one locking statement.
 *
 * The same argument as `nextTaskNumber` in the tasks service: read-then-write
 * would let two concurrent applies hand out the same ACME-7.
 */
async function reserveTaskNumbers(
  tx: Transaction,
  organizationId: string,
  projectId: string,
  howMany: number,
): Promise<number[]> {
  if (howMany === 0) return [];

  const [row] = await tx
    .update(schema.projects)
    .set({ taskCounter: sql`${schema.projects.taskCounter} + ${howMany}` })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .returning({ counter: schema.projects.taskCounter });

  const last = row?.counter ?? howMany;
  // The counter now points at the last number reserved.
  return Array.from({ length: howMany }, (_, index) => last - howMany + index + 1);
}

export async function applyTaskTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  templateId: string,
  input: ApplyTaskTemplateInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const template = await requireTemplate(db, actor.organizationId, templateId);

  if (template.kind !== 'task') {
    throw new HTTPException(400, { message: 'That is not a task template.' });
  }

  const payload = taskTemplatePayloadSchema.parse(template.payload);
  await requireProject(db, actor.organizationId, input.projectId);

  // Default to the project's first column, as a hand-created task does.
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

  const [lastTask] = await db
    .select({ position: schema.tasks.position })
    .from(schema.tasks)
    .where(
      scope.where(
        schema.tasks,
        eq(schema.tasks.projectId, input.projectId),
        input.parentTaskId
          ? eq(schema.tasks.parentTaskId, input.parentTaskId)
          : isNull(schema.tasks.parentTaskId),
      ),
    )
    .orderBy(desc(schema.tasks.position))
    .limit(1);

  const rootId = newId();
  const subtaskIds = payload.subtasks.map(() => newId());
  const positions = keySequence(payload.subtasks.length);
  const rootPosition = keyBetween(lastTask?.position ?? null, null);

  return scope.transaction(async (tx) => {
    const numbers = await reserveTaskNumbers(
      tx,
      actor.organizationId,
      input.projectId,
      1 + payload.subtasks.length,
    );

    await tx.insert(schema.tasks).values(
      scope.values({
        id: rootId,
        projectId: input.projectId,
        parentTaskId: input.parentTaskId ?? null,
        number: numbers[0] ?? 1,
        title: input.title ?? payload.title,
        descriptionText: payload.description,
        statusId,
        priority: payload.priority as 'none',
        reporterId: actor.actorId,
        estimateMinutes: payload.estimateMinutes,
        position: rootPosition,
      }),
    );

    if (payload.subtasks.length > 0) {
      await tx.insert(schema.tasks).values(
        payload.subtasks.map((subtask, index) =>
          scope.values({
            id: subtaskIds[index] ?? newId(),
            projectId: input.projectId,
            parentTaskId: rootId,
            number: numbers[index + 1] ?? index + 2,
            title: subtask.title,
            statusId,
            priority: subtask.priority as 'none',
            reporterId: actor.actorId,
            position: positions[index] ?? 'a0',
          }),
        ),
      );
    }

    const checklistPositions = keySequence(payload.checklists.length);

    for (const [index, checklist] of payload.checklists.entries()) {
      const checklistId = newId();
      const itemPositions = keySequence(checklist.items.length);

      await tx.insert(schema.checklists).values(
        scope.values({
          id: checklistId,
          taskId: rootId,
          title: checklist.title,
          position: checklistPositions[index] ?? keyBetween(null, null),
        }),
      );

      if (checklist.items.length > 0) {
        await tx.insert(schema.checklistItems).values(
          checklist.items.map((title, index) =>
            scope.values({
              checklistId,
              title,
              position: itemPositions[index] ?? keyBetween(null, null),
            }),
          ),
        );
      }
    }

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.created-from-template',
      entityType: 'task',
      entityId: rootId,
      changes: { template: { from: null, to: template.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return rootId;
  });
}

/** Shared by "apply a project template" and "duplicate this project". */
async function buildProject(
  db: AnyDatabase,
  actor: ActorContext,
  payload: ProjectTemplatePayload,
  target: { spaceId: string; name: string; key: string; source: string; sourceId: string },
) {
  const scope = withOrg(db, actor.organizationId);

  const [space] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(scope.where(schema.spaces, eq(schema.spaces.id, target.spaceId)))
    .limit(1);

  if (!space) throw new HTTPException(404, { message: 'No such space.' });
  await requireUnusedKey(db, actor.organizationId, target.key);

  const [lastProject] = await db
    .select({ position: schema.projects.position })
    .from(schema.projects)
    .where(scope.where(schema.projects))
    .orderBy(desc(schema.projects.position))
    .limit(1);

  const projectId = newId();
  const columnIds = payload.columns.map(() => newId());
  const columnPositions = keySequence(payload.columns.length);

  return scope.transaction(async (tx) => {
    await tx.insert(schema.projects).values(
      scope.values({
        id: projectId,
        spaceId: target.spaceId,
        name: target.name,
        key: target.key,
        status: 'planning',
        visibility: 'org',
        ownerId: actor.actorId,
        position: keyBetween(lastProject?.position ?? null, null),
      }),
    );

    await tx.insert(schema.taskStatuses).values(
      payload.columns.map((column, index) =>
        scope.values({
          id: columnIds[index] ?? newId(),
          projectId,
          name: column.name,
          category: column.category as 'todo',
          color: column.color,
          wipLimit: column.wipLimit,
          position: columnPositions[index] ?? keyBetween(null, null),
        }),
      ),
    );

    // The creator is a member of what they create, or they cannot open it.
    await tx
      .insert(schema.projectMembers)
      .values(scope.values({ projectId, userId: actor.actorId, role: 'manager' }));

    const tasks = payload.tasks ?? [];
    const totalTasks = tasks.reduce((sum, task) => sum + 1 + task.subtasks.length, 0);

    if (totalTasks > 0) {
      const numbers = await reserveTaskNumbers(tx, actor.organizationId, projectId, totalTasks);
      const taskPositions = keySequence(tasks.length);
      let cursor = 0;

      for (const [index, task] of tasks.entries()) {
        const taskId = newId();
        const statusId = columnIds[Math.min(task.columnIndex, columnIds.length - 1)] ?? null;

        await tx.insert(schema.tasks).values(
          scope.values({
            id: taskId,
            projectId,
            number: numbers[cursor] ?? cursor + 1,
            title: task.title,
            statusId,
            priority: task.priority as 'none',
            reporterId: actor.actorId,
            position: taskPositions[index] ?? keyBetween(null, null),
          }),
        );
        cursor += 1;

        if (task.subtasks.length > 0) {
          const subPositions = keySequence(task.subtasks.length);
          await tx.insert(schema.tasks).values(
            task.subtasks.map((subtask, subIndex) =>
              scope.values({
                projectId,
                parentTaskId: taskId,
                number: numbers[cursor + subIndex] ?? cursor + subIndex + 1,
                title: subtask.title,
                statusId,
                priority: subtask.priority as 'none',
                reporterId: actor.actorId,
                position: subPositions[subIndex] ?? keyBetween(null, null),
              }),
            ),
          );
          cursor += task.subtasks.length;
        }
      }
    }

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: target.source,
      entityType: 'project',
      entityId: projectId,
      changes: {
        name: { from: null, to: target.name },
        from: { from: null, to: target.sourceId },
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return projectId;
  });
}

export async function applyProjectTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  templateId: string,
  input: ApplyProjectTemplateInput,
) {
  const template = await requireTemplate(db, actor.organizationId, templateId);

  if (template.kind !== 'project') {
    throw new HTTPException(400, { message: 'That is not a project template.' });
  }

  const payload = projectTemplatePayloadSchema.parse(template.payload);

  return buildProject(db, actor, payload, {
    spaceId: input.spaceId,
    name: input.name,
    key: input.key,
    source: 'project.created-from-template',
    sourceId: templateId,
  });
}

export async function duplicateProject(
  db: AnyDatabase,
  actor: ActorContext,
  projectId: string,
  input: DuplicateProjectInput,
) {
  const source = await requireProject(db, actor.organizationId, projectId);

  // Duplicating is "save as template, apply, throw the template away" without
  // the round trip - the same snapshot code, so the two cannot drift.
  const templateShape = await snapshotProject(db, actor.organizationId, projectId, input.includeTasks);

  return buildProject(db, actor, templateShape, {
    spaceId: input.spaceId ?? source.spaceId,
    name: input.name,
    key: input.key,
    source: 'project.duplicated',
    sourceId: projectId,
  });
}

async function snapshotProject(
  db: AnyDatabase,
  organizationId: string,
  projectId: string,
  includeTasks: boolean,
): Promise<ProjectTemplatePayload> {
  const scope = withOrg(db, organizationId);

  const columns = await db
    .select({
      id: schema.taskStatuses.id,
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

  if (!includeTasks) return { columns, tasks: [] };

  const tasks = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      priority: schema.tasks.priority,
      statusId: schema.tasks.statusId,
      parentTaskId: schema.tasks.parentTaskId,
    })
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.projectId, projectId)))
    .orderBy(asc(schema.tasks.position));

  return {
    columns,
    tasks: tasks
      .filter((task) => task.parentTaskId === null)
      .map((task) => ({
        title: task.title,
        priority: task.priority,
        columnIndex: Math.max(
          0,
          columns.findIndex((column) => column.id === task.statusId),
        ),
        subtasks: tasks
          .filter((child) => child.parentTaskId === task.id)
          .map((child) => ({ title: child.title, priority: child.priority })),
      })),
  };
}
