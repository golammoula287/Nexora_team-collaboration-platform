import { and, asc, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, keySequence, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import type {
  CreateChecklistInput,
  CreateChecklistItemInput,
  MoveChecklistItemInput,
  UpdateChecklistInput,
  UpdateChecklistItemInput,
} from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Checklists on a task.
 *
 * Two levels - a named checklist holding ordered items - because "Definition of
 * done" and "Release steps" on the same task are different lists, not one long
 * one. Both levels soft-delete and both order by fractional index, so ticking
 * an item writes one row and dragging one writes one row.
 *
 * The audit rows are written against the *task*, not the checklist: "what
 * happened to this task" is the question the change log answers, and a person
 * reading it does not think of a checklist as a separate object.
 */

async function requireTask(db: AnyDatabase, organizationId: string, taskId: string) {
  const scope = withOrg(db, organizationId);

  const [task] = await db
    .select({ id: schema.tasks.id, title: schema.tasks.title })
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.id, taskId)))
    .limit(1);

  if (!task) throw new HTTPException(404, { message: 'No such task.' });
  return task;
}

async function requireChecklist(db: AnyDatabase, organizationId: string, checklistId: string) {
  const scope = withOrg(db, organizationId);

  const [checklist] = await db
    .select()
    .from(schema.checklists)
    .where(scope.where(schema.checklists, eq(schema.checklists.id, checklistId)))
    .limit(1);

  if (!checklist) throw new HTTPException(404, { message: 'No such checklist.' });
  return checklist;
}

async function requireItem(db: AnyDatabase, organizationId: string, itemId: string) {
  const scope = withOrg(db, organizationId);

  const [item] = await db
    .select()
    .from(schema.checklistItems)
    .where(scope.where(schema.checklistItems, eq(schema.checklistItems.id, itemId)))
    .limit(1);

  if (!item) throw new HTTPException(404, { message: 'No such checklist item.' });
  return item;
}

/** Every checklist on a task, with its items, in one round trip. */
export async function listChecklists(db: AnyDatabase, organizationId: string, taskId: string) {
  const scope = withOrg(db, organizationId);
  await requireTask(db, organizationId, taskId);

  const checklists = await db
    .select({
      id: schema.checklists.id,
      title: schema.checklists.title,
      position: schema.checklists.position,
    })
    .from(schema.checklists)
    .where(scope.where(schema.checklists, eq(schema.checklists.taskId, taskId)))
    .orderBy(asc(schema.checklists.position));

  if (checklists.length === 0) return [];

  const items = await db
    .select({
      id: schema.checklistItems.id,
      checklistId: schema.checklistItems.checklistId,
      title: schema.checklistItems.title,
      isDone: schema.checklistItems.isDone,
      position: schema.checklistItems.position,
    })
    .from(schema.checklistItems)
    .where(
      scope.where(
        schema.checklistItems,
        inArray(
          schema.checklistItems.checklistId,
          checklists.map((checklist) => checklist.id),
        ),
      ),
    )
    .orderBy(asc(schema.checklistItems.position));

  return checklists.map((checklist) => {
    const own = items.filter((item) => item.checklistId === checklist.id);
    return {
      ...checklist,
      items: own,
      doneCount: own.filter((item) => item.isDone).length,
      totalCount: own.length,
    };
  });
}

export async function createChecklist(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  input: CreateChecklistInput,
) {
  const scope = withOrg(db, actor.organizationId);
  await requireTask(db, actor.organizationId, taskId);

  const existing = await db
    .select({ position: schema.checklists.position })
    .from(schema.checklists)
    .where(scope.where(schema.checklists, eq(schema.checklists.taskId, taskId)))
    .orderBy(asc(schema.checklists.position));

  const checklistId = newId();
  const seeds = input.items ?? [];
  // Short keys for a known list, rather than repeated appends which lengthen.
  const itemPositions = keySequence(seeds.length);

  return scope.transaction(async (tx) => {
    await tx.insert(schema.checklists).values(
      scope.values({
        id: checklistId,
        taskId,
        title: input.title,
        position: keyBetween(existing.at(-1)?.position ?? null, null),
      }),
    );

    if (seeds.length > 0) {
      await tx.insert(schema.checklistItems).values(
        seeds.map((title, index) =>
          scope.values({
            checklistId,
            title,
            position: itemPositions[index] ?? keyBetween(null, null),
          }),
        ),
      );
    }

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'checklist.created',
      entityType: 'task',
      entityId: taskId,
      changes: { title: { from: null, to: input.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return checklistId;
  });
}

export async function updateChecklist(
  db: AnyDatabase,
  actor: ActorContext,
  checklistId: string,
  input: UpdateChecklistInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireChecklist(db, actor.organizationId, checklistId);

  if (input.title === undefined || input.title === existing.title) return existing;

  return scope.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.checklists)
      .set({ title: input.title })
      .where(
        and(
          eq(schema.checklists.id, checklistId),
          eq(schema.checklists.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'checklist.renamed',
      entityType: 'task',
      entityId: existing.taskId,
      changes: { title: { from: existing.title, to: input.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}

export async function deleteChecklist(
  db: AnyDatabase,
  actor: ActorContext,
  checklistId: string,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireChecklist(db, actor.organizationId, checklistId);
  const now = new Date();

  return scope.transaction(async (tx) => {
    // Soft delete, and the items go with it - a checklist whose items outlived
    // it would be a list of orphans nothing displays.
    await tx
      .update(schema.checklists)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.checklists.id, checklistId),
          eq(schema.checklists.organizationId, actor.organizationId),
        ),
      );

    await tx
      .update(schema.checklistItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.checklistItems.checklistId, checklistId),
          eq(schema.checklistItems.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'checklist.deleted',
      entityType: 'task',
      entityId: existing.taskId,
      changes: { title: { from: existing.title, to: null } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { deleted: 1 };
  });
}

export async function createChecklistItem(
  db: AnyDatabase,
  actor: ActorContext,
  checklistId: string,
  input: CreateChecklistItemInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const checklist = await requireChecklist(db, actor.organizationId, checklistId);

  const items = await db
    .select({ id: schema.checklistItems.id, position: schema.checklistItems.position })
    .from(schema.checklistItems)
    .where(scope.where(schema.checklistItems, eq(schema.checklistItems.checklistId, checklistId)))
    .orderBy(asc(schema.checklistItems.position));

  const index = input.afterItemId
    ? items.findIndex((item) => item.id === input.afterItemId)
    : items.length - 1;

  const itemId = newId();

  return scope.transaction(async (tx) => {
    await tx.insert(schema.checklistItems).values(
      scope.values({
        id: itemId,
        checklistId,
        title: input.title,
        position: keyBetween(
          index >= 0 ? (items[index]?.position ?? null) : null,
          index >= 0 ? (items[index + 1]?.position ?? null) : (items[0]?.position ?? null),
        ),
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'checklist.item-added',
      entityType: 'task',
      entityId: checklist.taskId,
      changes: { item: { from: null, to: input.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return itemId;
  });
}

export async function updateChecklistItem(
  db: AnyDatabase,
  actor: ActorContext,
  itemId: string,
  input: UpdateChecklistItemInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireItem(db, actor.organizationId, itemId);
  const checklist = await requireChecklist(db, actor.organizationId, existing.checklistId);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.title !== undefined && input.title !== existing.title) {
    changes['title'] = { from: existing.title, to: input.title };
  }
  if (input.isDone !== undefined && input.isDone !== existing.isDone) {
    changes['isDone'] = { from: existing.isDone, to: input.isDone };
  }

  if (Object.keys(changes).length === 0) return existing;

  return scope.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.checklistItems)
      .set(input)
      .where(
        and(
          eq(schema.checklistItems.id, itemId),
          eq(schema.checklistItems.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: input.isDone === undefined ? 'checklist.item-renamed' : 'checklist.item-checked',
      entityType: 'task',
      entityId: checklist.taskId,
      changes,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}

export async function moveChecklistItem(
  db: AnyDatabase,
  actor: ActorContext,
  itemId: string,
  input: MoveChecklistItemInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireItem(db, actor.organizationId, itemId);

  const targetChecklistId = input.checklistId ?? existing.checklistId;
  const target = await requireChecklist(db, actor.organizationId, targetChecklistId);
  const source = await requireChecklist(db, actor.organizationId, existing.checklistId);

  if (target.taskId !== source.taskId) {
    throw new HTTPException(400, {
      message: 'An item can only move between checklists on the same task.',
    });
  }

  const siblings = await db
    .select({ id: schema.checklistItems.id, position: schema.checklistItems.position })
    .from(schema.checklistItems)
    .where(
      scope.where(schema.checklistItems, eq(schema.checklistItems.checklistId, targetChecklistId)),
    );

  const positionOf = (id: string | null | undefined) =>
    id ? (siblings.find((sibling) => sibling.id === id)?.position ?? null) : null;

  const position = keyBetween(positionOf(input.afterItemId), positionOf(input.beforeItemId));

  return scope.transaction(async (tx) => {
    const [moved] = await tx
      .update(schema.checklistItems)
      .set({ checklistId: targetChecklistId, position })
      .where(
        and(
          eq(schema.checklistItems.id, itemId),
          eq(schema.checklistItems.organizationId, actor.organizationId),
        ),
      )
      .returning();

    return moved;
  });
}

export async function deleteChecklistItem(
  db: AnyDatabase,
  actor: ActorContext,
  itemId: string,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireItem(db, actor.organizationId, itemId);
  const checklist = await requireChecklist(db, actor.organizationId, existing.checklistId);

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.checklistItems)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.checklistItems.id, itemId),
          eq(schema.checklistItems.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'checklist.item-removed',
      entityType: 'task',
      entityId: checklist.taskId,
      changes: { item: { from: existing.title, to: null } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { deleted: 1 };
  });
}
