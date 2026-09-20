import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { keyBetween, newId, schema, withOrg, type AnyDatabase } from '@nexora/db';
import {
  documentContentSchema,
  documentTemplatePayloadSchema,
  type CreateDocumentAnnotationInput,
  type CreateDocumentFromTemplateInput,
  type CreateDocumentInput,
  type CreateDocumentTemplateInput,
  type MoveDocumentInput,
  type UpdateDocumentInput,
} from '@nexora/shared';
import { recordActivity } from '../lib/audit.js';
import type { ActorContext } from './projects.js';

export async function listDocuments(db: AnyDatabase, organizationId: string, userId: string) {
  const scope = withOrg(db, organizationId);
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      spaceId: schema.documents.spaceId,
      projectId: schema.documents.projectId,
      parentDocumentId: schema.documents.parentDocumentId,
      position: schema.documents.position,
      updatedAt: schema.documents.updatedAt,
      favorite: sql<boolean>`${schema.documentFavorites.id} is not null`,
      wikiHome: sql<boolean>`${schema.spaceWikiHomes.id} is not null`,
    })
    .from(schema.documents)
    .leftJoin(
      schema.documentFavorites,
      and(
        eq(schema.documentFavorites.organizationId, organizationId),
        eq(schema.documentFavorites.documentId, schema.documents.id),
        eq(schema.documentFavorites.userId, userId),
      ),
    )
    .leftJoin(
      schema.spaceWikiHomes,
      and(
        eq(schema.spaceWikiHomes.organizationId, organizationId),
        eq(schema.spaceWikiHomes.documentId, schema.documents.id),
      ),
    )
    .where(scope.where(schema.documents))
    .orderBy(asc(schema.documents.position));
}

export async function getDocument(db: AnyDatabase, organizationId: string, id: string) {
  const scope = withOrg(db, organizationId);
  const [document] = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      content: schema.documents.content,
      contentText: schema.documents.contentText,
      spaceId: schema.documents.spaceId,
      projectId: schema.documents.projectId,
      parentDocumentId: schema.documents.parentDocumentId,
      position: schema.documents.position,
      updatedAt: schema.documents.updatedAt,
    })
    .from(schema.documents)
    .where(scope.where(schema.documents, eq(schema.documents.id, id)))
    .limit(1);
  if (!document) throw new HTTPException(404, { message: 'Document not found' });
  return document;
}

export async function createDocument(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateDocumentInput,
) {
  const scope = withOrg(db, actor.organizationId);
  let projectSpaceId: string | null = null;
  if (input.spaceId) {
    const [space] = await db
      .select({ id: schema.spaces.id })
      .from(schema.spaces)
      .where(scope.where(schema.spaces, eq(schema.spaces.id, input.spaceId)))
      .limit(1);
    if (!space) throw new HTTPException(404, { message: 'Space not found' });
  }
  if (input.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id, spaceId: schema.projects.spaceId })
      .from(schema.projects)
      .where(scope.where(schema.projects, eq(schema.projects.id, input.projectId)))
      .limit(1);
    if (!project) throw new HTTPException(404, { message: 'Project not found' });
    projectSpaceId = project.spaceId;
    if (input.spaceId && input.spaceId !== projectSpaceId)
      throw new HTTPException(400, { message: 'Project belongs to a different space' });
  }
  const parent = input.parentDocumentId
    ? await getDocument(db, actor.organizationId, input.parentDocumentId)
    : null;
  if (
    parent &&
    ((input.spaceId && input.spaceId !== parent.spaceId) ||
      (input.projectId && input.projectId !== parent.projectId))
  ) {
    throw new HTTPException(400, {
      message: 'Child and parent must belong to the same space or project',
    });
  }
  const [last] = await db
    .select({ position: schema.documents.position })
    .from(schema.documents)
    .where(scope.where(schema.documents))
    .orderBy(desc(schema.documents.position))
    .limit(1);
  const id = newId();
  await scope.transaction(async (tx) => {
    await tx.insert(schema.documents).values(
      scope.values({
        id,
        title: input.title,
        spaceId: parent?.spaceId ?? input.spaceId ?? projectSpaceId,
        projectId: parent?.projectId ?? input.projectId ?? null,
        parentDocumentId: input.parentDocumentId ?? null,
        position: keyBetween(last?.position ?? null, null),
        createdById: actor.actorId,
        content: input.content ?? { type: 'doc', content: [] },
        contentText: input.contentText ?? '',
      }),
    );
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.created',
      entityType: 'document',
      entityId: id,
      changes: { title: { from: null, to: input.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return id;
}

export async function updateDocument(
  db: AnyDatabase,
  actor: ActorContext,
  id: string,
  input: UpdateDocumentInput,
) {
  const existing = await getDocument(db, actor.organizationId, id);
  const scope = withOrg(db, actor.organizationId);
  if (input.parentDocumentId) {
    const visited = new Set([id]);
    let parentId: string | null = input.parentDocumentId;
    while (parentId) {
      if (visited.has(parentId))
        throw new HTTPException(400, { message: 'A document cannot contain itself' });
      visited.add(parentId);
      const parent = await getDocument(db, actor.organizationId, parentId);
      if (parent.spaceId !== existing.spaceId || parent.projectId !== existing.projectId)
        throw new HTTPException(400, {
          message: 'Child and parent must belong to the same space or project',
        });
      parentId = parent.parentDocumentId;
    }
  }
  const contentChanged = input.content !== undefined || input.contentText !== undefined;
  const title = input.title ?? existing.title;
  const content = input.content ?? existing.content;
  const contentText = input.contentText ?? existing.contentText;
  await scope.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({
        title,
        content,
        contentText,
        parentDocumentId:
          input.parentDocumentId === undefined ? existing.parentDocumentId : input.parentDocumentId,
        updatedAt: new Date(),
      })
      .where(scope.where(schema.documents, eq(schema.documents.id, id)));
    if (contentChanged || input.title !== undefined) {
      await tx.insert(schema.documentVersions).values(
        scope.values({
          documentId: id,
          title,
          content,
          contentText,
          createdById: actor.actorId,
        }),
      );
    }
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.updated',
      entityType: 'document',
      entityId: id,
      changes: { title: { from: existing.title, to: title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return getDocument(db, actor.organizationId, id);
}

export async function deleteDocument(db: AnyDatabase, actor: ActorContext, id: string) {
  const existing = await getDocument(db, actor.organizationId, id);
  const scope = withOrg(db, actor.organizationId);
  await scope.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ parentDocumentId: existing.parentDocumentId })
      .where(scope.where(schema.documents, eq(schema.documents.parentDocumentId, id)));
    await tx
      .update(schema.documents)
      .set({ deletedAt: new Date() })
      .where(scope.where(schema.documents, eq(schema.documents.id, id)));
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.deleted',
      entityType: 'document',
      entityId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return { deleted: true };
}

export async function listDocumentVersions(
  db: AnyDatabase,
  organizationId: string,
  documentId: string,
) {
  await getDocument(db, organizationId, documentId);
  const scope = withOrg(db, organizationId);
  return db
    .select({
      id: schema.documentVersions.id,
      title: schema.documentVersions.title,
      content: schema.documentVersions.content,
      contentText: schema.documentVersions.contentText,
      createdAt: schema.documentVersions.createdAt,
      createdById: schema.documentVersions.createdById,
    })
    .from(schema.documentVersions)
    .where(scope.where(schema.documentVersions, eq(schema.documentVersions.documentId, documentId)))
    .orderBy(desc(schema.documentVersions.createdAt));
}

export async function restoreDocumentVersion(
  db: AnyDatabase,
  actor: ActorContext,
  documentId: string,
  versionId: string,
) {
  const current = await getDocument(db, actor.organizationId, documentId);
  const scope = withOrg(db, actor.organizationId);
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      scope.where(
        schema.documentVersions,
        eq(schema.documentVersions.documentId, documentId),
        eq(schema.documentVersions.id, versionId),
      ),
    )
    .limit(1);
  if (!version) throw new HTTPException(404, { message: 'Version not found' });
  await scope.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({
        title: version.title,
        content: version.content,
        contentText: version.contentText,
        updatedAt: new Date(),
      })
      .where(scope.where(schema.documents, eq(schema.documents.id, documentId)));
    await tx.insert(schema.documentVersions).values(
      scope.values({
        documentId,
        title: version.title,
        content: version.content,
        contentText: version.contentText,
        createdById: actor.actorId,
        label: 'Restored version',
      }),
    );
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.restored',
      entityType: 'document',
      entityId: documentId,
      changes: { title: { from: current.title, to: version.title } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return getDocument(db, actor.organizationId, documentId);
}

export async function moveDocument(
  db: AnyDatabase,
  actor: ActorContext,
  id: string,
  input: MoveDocumentInput,
) {
  const document = await getDocument(db, actor.organizationId, id);
  if (input.parentDocumentId) {
    const seen = new Set([id]);
    let parentId: string | null = input.parentDocumentId;
    while (parentId) {
      if (seen.has(parentId))
        throw new HTTPException(400, { message: 'A document cannot contain itself' });
      seen.add(parentId);
      const parent = await getDocument(db, actor.organizationId, parentId);
      if (parent.spaceId !== document.spaceId || parent.projectId !== document.projectId)
        throw new HTTPException(400, { message: 'Documents must stay in their space or project' });
      parentId = parent.parentDocumentId;
    }
  }
  const scope = withOrg(db, actor.organizationId);
  const siblings = await db
    .select({ id: schema.documents.id, position: schema.documents.position })
    .from(schema.documents)
    .where(
      scope.where(
        schema.documents,
        input.parentDocumentId
          ? eq(schema.documents.parentDocumentId, input.parentDocumentId)
          : isNull(schema.documents.parentDocumentId),
        document.spaceId
          ? eq(schema.documents.spaceId, document.spaceId)
          : isNull(schema.documents.spaceId),
        document.projectId
          ? eq(schema.documents.projectId, document.projectId)
          : isNull(schema.documents.projectId),
        ne(schema.documents.id, id),
      ),
    )
    .orderBy(asc(schema.documents.position));
  const index =
    input.afterDocumentId === null
      ? -1
      : siblings.findIndex((sibling) => sibling.id === input.afterDocumentId);
  if (input.afterDocumentId !== null && index < 0)
    throw new HTTPException(400, { message: 'Previous document must be a sibling' });
  const position = keyBetween(
    siblings[index]?.position ?? null,
    siblings[index + 1]?.position ?? null,
  );
  await scope.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ parentDocumentId: input.parentDocumentId, position, updatedAt: new Date() })
      .where(scope.where(schema.documents, eq(schema.documents.id, id)));
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.moved',
      entityType: 'document',
      entityId: id,
      changes: {
        parentDocumentId: { from: document.parentDocumentId, to: input.parentDocumentId },
        position: { from: document.position, to: position },
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return getDocument(db, actor.organizationId, id);
}

export async function setDocumentFavorite(
  db: AnyDatabase,
  actor: ActorContext,
  documentId: string,
  favorite: boolean,
) {
  await getDocument(db, actor.organizationId, documentId);
  const scope = withOrg(db, actor.organizationId);
  const [existing] = await db
    .select({ id: schema.documentFavorites.id })
    .from(schema.documentFavorites)
    .where(
      scope.where(
        schema.documentFavorites,
        eq(schema.documentFavorites.documentId, documentId),
        eq(schema.documentFavorites.userId, actor.actorId),
      ),
    )
    .limit(1);
  if (Boolean(existing) === favorite) return { favorite };
  await scope.transaction(async (tx) => {
    if (favorite)
      await tx
        .insert(schema.documentFavorites)
        .values(scope.values({ documentId, userId: actor.actorId }));
    else
      await tx
        .delete(schema.documentFavorites)
        .where(
          scope.where(
            schema.documentFavorites,
            eq(schema.documentFavorites.id, existing?.id ?? ''),
          ),
        );
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: favorite ? 'document.favorited' : 'document.unfavorited',
      entityType: 'document',
      entityId: documentId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return { favorite };
}

export async function setSpaceWikiHome(
  db: AnyDatabase,
  actor: ActorContext,
  spaceId: string,
  documentId: string,
) {
  const document = await getDocument(db, actor.organizationId, documentId);
  if (document.spaceId !== spaceId)
    throw new HTTPException(400, { message: 'Wiki home must belong to this space' });
  const scope = withOrg(db, actor.organizationId);
  const [space] = await db
    .select({ id: schema.spaces.id })
    .from(schema.spaces)
    .where(scope.where(schema.spaces, eq(schema.spaces.id, spaceId)))
    .limit(1);
  if (!space) throw new HTTPException(404, { message: 'Space not found' });
  const [existing] = await db
    .select({ id: schema.spaceWikiHomes.id, documentId: schema.spaceWikiHomes.documentId })
    .from(schema.spaceWikiHomes)
    .where(scope.where(schema.spaceWikiHomes, eq(schema.spaceWikiHomes.spaceId, spaceId)))
    .limit(1);
  if (existing?.documentId === documentId) return { documentId };
  await scope.transaction(async (tx) => {
    if (existing)
      await tx
        .update(schema.spaceWikiHomes)
        .set({ documentId, updatedAt: new Date() })
        .where(scope.where(schema.spaceWikiHomes, eq(schema.spaceWikiHomes.id, existing.id)));
    else await tx.insert(schema.spaceWikiHomes).values(scope.values({ spaceId, documentId }));
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'space.wiki-home-set',
      entityType: 'space',
      entityId: spaceId,
      changes: { documentId: { from: existing?.documentId ?? null, to: documentId } },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return { documentId };
}

export const DOCUMENT_PRESETS = {
  'meeting-notes': {
    name: 'Meeting notes',
    sections: ['Attendees', 'Agenda', 'Notes', 'Decisions', 'Action items'],
  },
  prd: {
    name: 'PRD',
    sections: ['Summary', 'Problem', 'Goals', 'Requirements', 'Success metrics'],
  },
  retro: { name: 'Retro', sections: ['What went well', 'What could improve', 'Actions'] },
  sop: { name: 'SOP', sections: ['Purpose', 'Scope', 'Procedure', 'Owner', 'Review date'] },
  onboarding: {
    name: 'Onboarding',
    sections: ['Welcome', 'First day', 'First week', 'People', 'Resources'],
  },
} as const;

function presetContent(key: keyof typeof DOCUMENT_PRESETS) {
  const preset = DOCUMENT_PRESETS[key];
  return {
    type: 'doc',
    content: preset.sections.flatMap((section) => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section }] },
      { type: 'paragraph' },
    ]),
  };
}

export async function listDocumentTemplates(db: AnyDatabase, organizationId: string) {
  const scope = withOrg(db, organizationId);
  const custom = await db
    .select({ id: schema.templates.id, name: schema.templates.name })
    .from(schema.templates)
    .where(scope.where(schema.templates, eq(schema.templates.kind, 'document')))
    .orderBy(asc(schema.templates.name));
  return {
    presets: Object.entries(DOCUMENT_PRESETS).map(([key, value]) => ({ key, name: value.name })),
    custom,
  };
}

export async function saveDocumentTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateDocumentTemplateInput,
) {
  const document = await getDocument(db, actor.organizationId, input.documentId);
  const scope = withOrg(db, actor.organizationId);
  const id = newId();
  await scope.transaction(async (tx) => {
    await tx.insert(schema.templates).values(
      scope.values({
        id,
        kind: 'document',
        name: input.name,
        payload: {
          title: document.title,
          content: document.content,
          contentText: document.contentText,
        },
        createdById: actor.actorId,
      }),
    );
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: 'document.template-saved',
      entityType: 'document',
      entityId: input.documentId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return id;
}

export async function createDocumentFromTemplate(
  db: AnyDatabase,
  actor: ActorContext,
  input: CreateDocumentFromTemplateInput,
) {
  let title: string;
  let content: unknown;
  let contentText: string;
  if (input.preset) {
    title = DOCUMENT_PRESETS[input.preset].name;
    content = presetContent(input.preset);
    contentText = DOCUMENT_PRESETS[input.preset].sections.join('\n');
  } else {
    const scope = withOrg(db, actor.organizationId);
    const [template] = await db
      .select({ payload: schema.templates.payload })
      .from(schema.templates)
      .where(
        scope.where(
          schema.templates,
          eq(schema.templates.id, input.templateId ?? ''),
          eq(schema.templates.kind, 'document'),
        ),
      )
      .limit(1);
    if (!template) throw new HTTPException(404, { message: 'Template not found' });
    const payload = documentTemplatePayloadSchema.safeParse(template.payload);
    if (!payload.success) throw new HTTPException(422, { message: 'Template content is invalid' });
    title = payload.data.title;
    contentText = payload.data.contentText;
    content = payload.data.content;
  }
  const id = await createDocument(db, actor, {
    title,
    content: documentContentSchema.parse(content),
    contentText,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  });
  return getDocument(db, actor.organizationId, id);
}

export async function listDocumentAnnotations(
  db: AnyDatabase,
  organizationId: string,
  documentId: string,
) {
  await getDocument(db, organizationId, documentId);
  const scope = withOrg(db, organizationId);
  return db
    .select({
      id: schema.comments.id,
      bodyText: schema.comments.bodyText,
      selectionFrom: schema.comments.selectionFrom,
      selectionTo: schema.comments.selectionTo,
      selectionQuote: schema.comments.selectionQuote,
      suggestion: schema.comments.suggestion,
      resolvedAt: schema.comments.resolvedAt,
      authorId: schema.comments.authorId,
      createdAt: schema.comments.createdAt,
    })
    .from(schema.comments)
    .where(
      scope.where(
        schema.comments,
        eq(schema.comments.entityType, 'document'),
        eq(schema.comments.entityId, documentId),
      ),
    )
    .orderBy(asc(schema.comments.createdAt));
}

export async function createDocumentAnnotation(
  db: AnyDatabase,
  actor: ActorContext,
  documentId: string,
  input: CreateDocumentAnnotationInput,
) {
  const document = await getDocument(db, actor.organizationId, documentId);
  if (
    input.selectionTo <= input.selectionFrom ||
    (input.selectionQuote && !document.contentText.includes(input.selectionQuote))
  )
    throw new HTTPException(400, { message: 'Select text in this document first' });
  const scope = withOrg(db, actor.organizationId);
  const id = newId();
  await scope.transaction(async (tx) => {
    await tx.insert(schema.comments).values(
      scope.values({
        id,
        entityType: 'document',
        entityId: documentId,
        authorId: actor.actorId,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: input.bodyText }] }],
        },
        bodyText: input.bodyText,
        selectionFrom: input.selectionFrom,
        selectionTo: input.selectionTo,
        selectionQuote: input.selectionQuote,
        suggestion: input.suggestion ? { text: input.suggestion } : null,
      }),
    );
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: input.suggestion ? 'document.suggestion-created' : 'document.comment-created',
      entityType: 'document',
      entityId: documentId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return id;
}

export async function resolveDocumentAnnotation(
  db: AnyDatabase,
  actor: ActorContext,
  documentId: string,
  annotationId: string,
  resolved: boolean,
) {
  await getDocument(db, actor.organizationId, documentId);
  const scope = withOrg(db, actor.organizationId);
  const [annotation] = await db
    .select({ id: schema.comments.id })
    .from(schema.comments)
    .where(
      scope.where(
        schema.comments,
        eq(schema.comments.id, annotationId),
        eq(schema.comments.entityType, 'document'),
        eq(schema.comments.entityId, documentId),
      ),
    )
    .limit(1);
  if (!annotation) throw new HTTPException(404, { message: 'Comment not found' });
  await scope.transaction(async (tx) => {
    await tx
      .update(schema.comments)
      .set({ resolvedAt: resolved ? new Date() : null, updatedAt: new Date() })
      .where(scope.where(schema.comments, eq(schema.comments.id, annotationId)));
    await recordActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      action: resolved ? 'document.comment-resolved' : 'document.comment-reopened',
      entityType: 'document',
      entityId: documentId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  });
  return { resolved };
}
