import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, schema, withOrg, type AnyDatabase, type Transaction } from '@nexora/db';
import type { CreateSavedViewInput, UpdateSavedViewInput } from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

/**
 * Saved views: a named filter, grouping, sort and column set.
 *
 * Two decisions worth stating.
 *
 * **A share token is not an authorization bypass.** It names a view; it does
 * not grant access to the tasks the view returns. Opening a shared link still
 * requires a session and membership of the organization. A token that returned
 * data on its own would be a tenant leak wearing a convenience feature's
 * clothes, and "unguessable" is not an access control.
 *
 * **Default views are per person, per project.** One person's preferred way of
 * looking at a board is not a decision they get to make for everyone else, so
 * setting a default clears only the caller's other defaults.
 */

/** 32 unguessable characters. Not a secret, but not enumerable either. */
function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

async function requireView(db: AnyDatabase, organizationId: string, viewId: string) {
  const scope = withOrg(db, organizationId);

  const [view] = await db
    .select()
    .from(schema.savedViews)
    .where(scope.where(schema.savedViews, eq(schema.savedViews.id, viewId)))
    .limit(1);

  if (!view) throw new HTTPException(404, { message: 'No such view.' });
  return view;
}

/**
 * The caller's own views plus the organization's shared ones.
 *
 * Both halves are filtered in the SQL, not fetched and sorted out afterwards -
 * "shared" is a predicate, and applying it in JS would mean reading every
 * person's private views to decide they are not yours.
 */
export async function listSavedViews(
  db: AnyDatabase,
  organizationId: string,
  userId: string,
  projectId?: string,
) {
  const scope = withOrg(db, organizationId);

  return db
    .select({
      id: schema.savedViews.id,
      projectId: schema.savedViews.projectId,
      name: schema.savedViews.name,
      layout: schema.savedViews.layout,
      config: schema.savedViews.config,
      isShared: schema.savedViews.isShared,
      isDefault: schema.savedViews.isDefault,
      shareToken: schema.savedViews.shareToken,
      ownerId: schema.savedViews.ownerId,
      ownerName: schema.user.name,
      createdAt: schema.savedViews.createdAt,
    })
    .from(schema.savedViews)
    .leftJoin(schema.user, eq(schema.user.id, schema.savedViews.ownerId))
    .where(
      scope.where(
        schema.savedViews,
        or(eq(schema.savedViews.ownerId, userId), eq(schema.savedViews.isShared, true)),
        projectId ? eq(schema.savedViews.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(schema.savedViews.isDefault), desc(schema.savedViews.createdAt));
}

export async function getSavedViewByToken(
  db: AnyDatabase,
  organizationId: string,
  shareToken: string,
) {
  const scope = withOrg(db, organizationId);

  const [view] = await db
    .select()
    .from(schema.savedViews)
    .where(scope.where(schema.savedViews, eq(schema.savedViews.shareToken, shareToken)))
    .limit(1);

  // Scoped to the caller's organization, so a token from another tenant is a
  // 404 here even though the row exists.
  if (!view) throw new HTTPException(404, { message: 'No such view.' });
  return view;
}

export async function createSavedView(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateSavedViewInput,
) {
  const scope = withOrg(db, actor.organizationId);

  if (input.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(scope.where(schema.projects, eq(schema.projects.id, input.projectId)))
      .limit(1);

    if (!project) throw new HTTPException(404, { message: 'No such project.' });
  }

  const viewId = newId();

  return scope.transaction(async (tx) => {
    if (input.isDefault) await clearDefaults(tx, actor, input.projectId ?? null);

    await tx.insert(schema.savedViews).values(
      scope.values({
        id: viewId,
        projectId: input.projectId ?? null,
        ownerId: actor.actorId,
        name: input.name,
        layout: input.layout,
        config: input.config,
        isShared: input.isShared,
        isDefault: input.isDefault,
        shareToken: input.isShared ? newShareToken() : null,
      }),
    );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'view.created',
      entityType: input.projectId ? 'project' : 'organization',
      entityId: input.projectId ?? actor.organizationId,
      changes: { name: { from: null, to: input.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return viewId;
  });
}

/** Only the caller's own defaults are cleared - see the note at the top. */
async function clearDefaults(tx: Transaction, actor: ActorContext, projectId: string | null) {
  await tx
    .update(schema.savedViews)
    .set({ isDefault: false })
    .where(
      and(
        eq(schema.savedViews.organizationId, actor.organizationId),
        eq(schema.savedViews.ownerId, actor.actorId),
        eq(schema.savedViews.isDefault, true),
        projectId ? eq(schema.savedViews.projectId, projectId) : isNull(schema.savedViews.projectId),
      ),
    );
}

export async function updateSavedView(
  db: AnyDatabase,
  actor: ActorContext,
  viewId: string,
  input: UpdateSavedViewInput,
) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireView(db, actor.organizationId, viewId);

  // A shared view is still owned by the person who made it. Editing someone
  // else's saved view would change what their teammates see without their
  // knowing, so it is refused rather than gated on role.
  if (existing.ownerId !== actor.actorId) {
    throw new HTTPException(403, { message: 'Only the person who saved a view can change it.' });
  }

  const patch: Record<string, unknown> = { ...input };

  // Sharing mints a token the first time; un-sharing revokes it, so an old link
  // stops working rather than quietly continuing to.
  if (input.isShared === true && !existing.shareToken) patch['shareToken'] = newShareToken();
  if (input.isShared === false) patch['shareToken'] = null;

  return scope.transaction(async (tx) => {
    if (input.isDefault === true) await clearDefaults(tx, actor, existing.projectId);

    const [updated] = await tx
      .update(schema.savedViews)
      .set(patch)
      .where(
        and(
          eq(schema.savedViews.id, viewId),
          eq(schema.savedViews.organizationId, actor.organizationId),
        ),
      )
      .returning();

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'view.updated',
      entityType: existing.projectId ? 'project' : 'organization',
      entityId: existing.projectId ?? actor.organizationId,
      changes: { name: { from: existing.name, to: updated?.name ?? existing.name } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updated;
  });
}

export async function deleteSavedView(db: AnyDatabase, actor: ActorContext, viewId: string) {
  const scope = withOrg(db, actor.organizationId);
  const existing = await requireView(db, actor.organizationId, viewId);

  if (existing.ownerId !== actor.actorId) {
    throw new HTTPException(403, { message: 'Only the person who saved a view can delete it.' });
  }

  return scope.transaction(async (tx) => {
    await tx
      .update(schema.savedViews)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.savedViews.id, viewId),
          eq(schema.savedViews.organizationId, actor.organizationId),
        ),
      );

    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'view.deleted',
      entityType: existing.projectId ? 'project' : 'organization',
      entityId: existing.projectId ?? actor.organizationId,
      changes: { name: { from: existing.name, to: null } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { deleted: 1 };
  });
}
