import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { schema, withOrg, type AnyDatabase } from '@nexora/db';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Task watchers.
 *
 * A watcher is "tell me when this changes". The notifications themselves are
 * phase 5's job; this is the subscription list they will read, and the reason
 * it exists now is that the table and the UI affordance belong with the task,
 * not with the delivery mechanism.
 *
 * Adding *someone else* as a watcher is allowed - it is how you loop a
 * colleague in - but only if they are a member of this organization. The id
 * comes from the client, so it is checked rather than trusted (CLAUDE.md).
 */

async function requireTask(db: AnyDatabase, organizationId: string, taskId: string) {
  const scope = withOrg(db, organizationId);

  const [task] = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(scope.where(schema.tasks, eq(schema.tasks.id, taskId)))
    .limit(1);

  if (!task) throw new HTTPException(404, { message: 'No such task.' });
  return task;
}

async function requireMember(db: AnyDatabase, organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
    )
    .limit(1);

  if (!row) throw new HTTPException(404, { message: 'No such member.' });
}

export async function listWatchers(db: AnyDatabase, organizationId: string, taskId: string) {
  const scope = withOrg(db, organizationId);
  await requireTask(db, organizationId, taskId);

  return db
    .select({
      userId: schema.taskWatchers.userId,
      name: schema.user.name,
      image: schema.user.image,
      since: schema.taskWatchers.createdAt,
    })
    .from(schema.taskWatchers)
    .innerJoin(schema.user, eq(schema.user.id, schema.taskWatchers.userId))
    .where(scope.where(schema.taskWatchers, eq(schema.taskWatchers.taskId, taskId)));
}

export async function watchTask(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  userId?: string,
) {
  const scope = withOrg(db, actor.organizationId);
  await requireTask(db, actor.organizationId, taskId);

  const target = userId ?? actor.actorId;
  if (target !== actor.actorId) await requireMember(db, actor.organizationId, target);

  const [existing] = await db
    .select({ id: schema.taskWatchers.id })
    .from(schema.taskWatchers)
    .where(
      scope.where(
        schema.taskWatchers,
        and(eq(schema.taskWatchers.taskId, taskId), eq(schema.taskWatchers.userId, target)),
      ),
    )
    .limit(1);

  // Watching twice is the same as watching once, and the unique index would
  // turn a double click into a 500.
  if (existing) return { watching: true, added: false };

  return scope.transaction(async (tx) => {
    await tx.insert(schema.taskWatchers).values(scope.values({ taskId, userId: target }));

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'task.watched',
      entityType: 'task',
      entityId: taskId,
      changes: { watcher: { from: null, to: target } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { watching: true, added: true };
  });
}

export async function unwatchTask(
  db: AnyDatabase,
  actor: ActorContext,
  taskId: string,
  userId?: string,
) {
  const scope = withOrg(db, actor.organizationId);
  await requireTask(db, actor.organizationId, taskId);

  const target = userId ?? actor.actorId;

  return scope.transaction(async (tx) => {
    // No soft delete: a subscription is a switch, and keeping a tombstone would
    // only complicate the "am I watching?" read.
    const removed = await tx
      .delete(schema.taskWatchers)
      .where(
        and(
          eq(schema.taskWatchers.taskId, taskId),
          eq(schema.taskWatchers.userId, target),
          eq(schema.taskWatchers.organizationId, actor.organizationId),
        ),
      )
      .returning({ id: schema.taskWatchers.id });

    if (removed.length > 0) {
      await recordActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        action: 'task.unwatched',
        entityType: 'task',
        entityId: taskId,
        changes: { watcher: { from: target, to: null } },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return { watching: false, removed: removed.length };
  });
}
