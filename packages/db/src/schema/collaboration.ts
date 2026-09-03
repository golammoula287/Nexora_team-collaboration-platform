import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdOnly, primaryId, timestamps } from '../columns.js';
import { user } from './auth.js';
import { attachmentStatusEnum, channelKindEnum, entityTypeEnum } from './enums.js';
import { organizationId } from './org-column.js';
import { projects, spaces } from './work.js';

/** Yjs document state. Binary, opaque to Postgres, merged by the client. */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
});

/**
 * Comments are polymorphic: one table for tasks, docs, projects, files and
 * contacts. `entityType` + `entityId` identify the parent; `parentCommentId`
 * gives threading.
 */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    organizationId: organizationId(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    parentCommentId: uuid('parent_comment_id').references((): AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Tiptap document. */
    body: jsonb('body').notNull(),
    /** Plain-text mirror, for search and embeddings. */
    bodyText: text('body_text').notNull().default(''),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
    /** A deleted comment leaves a tombstone so the thread still reads correctly. */
    isTombstone: boolean('is_tombstone').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('comments_entity_idx').on(t.organizationId, t.entityType, t.entityId, t.deletedAt),
    index('comments_parent_idx').on(t.parentCommentId),
    index('comments_author_idx').on(t.authorId),
  ],
);

export const mentions = pgTable(
  'mentions',
  {
    id: primaryId(),
    organizationId: organizationId(),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id'),
    /** Exactly one of these is set. */
    mentionedUserId: uuid('mentioned_user_id').references(() => user.id, { onDelete: 'cascade' }),
    mentionedTeamId: uuid('mentioned_team_id'),
    ...createdOnly,
  },
  (t) => [
    index('mentions_user_idx').on(t.organizationId, t.mentionedUserId),
    index('mentions_comment_idx').on(t.commentId),
  ],
);

export const reactions = pgTable(
  'reactions',
  {
    id: primaryId(),
    organizationId: organizationId(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('reactions_uq').on(t.entityType, t.entityId, t.userId, t.emoji),
    index('reactions_entity_idx').on(t.organizationId, t.entityType, t.entityId),
  ],
);

/**
 * A file in R2. `storageKey` is the object key; the row is created before the
 * upload finishes, which is why `status` exists.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: primaryId(),
    organizationId: organizationId(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    uploadedById: uuid('uploaded_by_id').references(() => user.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum'),
    status: attachmentStatusEnum('status').notNull().default('pending'),
    /** Version chain; null on the first upload of a file. */
    previousVersionId: uuid('previous_version_id').references((): AnyPgColumn => attachments.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('attachments_entity_idx').on(t.organizationId, t.entityType, t.entityId, t.deletedAt),
    uniqueIndex('attachments_storage_key_uq').on(t.storageKey),
    index('attachments_uploader_idx').on(t.uploadedById),
    index('attachments_previous_version_idx').on(t.previousVersionId),
  ],
);

export const channels = pgTable(
  'channels',
  {
    id: primaryId(),
    organizationId: organizationId(),
    kind: channelKindEnum('kind').notNull().default('project'),
    name: text('name'),
    topic: text('topic'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    isPrivate: boolean('is_private').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('channels_org_idx').on(t.organizationId, t.deletedAt),
    index('channels_project_idx').on(t.projectId),
    index('channels_space_idx').on(t.spaceId),
  ],
);

export const channelMembers = pgTable(
  'channel_members',
  {
    id: primaryId(),
    organizationId: organizationId(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'date' }),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('channel_members_uq').on(t.channelId, t.userId),
    index('channel_members_user_idx').on(t.userId),
    index('channel_members_org_idx').on(t.organizationId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: primaryId(),
    organizationId: organizationId(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentMessageId: uuid('parent_message_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'cascade',
    }),
    body: jsonb('body').notNull(),
    bodyText: text('body_text').notNull().default(''),
    isPinned: boolean('is_pinned').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    // The channel view pages backwards through time.
    index('messages_channel_idx').on(t.channelId, t.createdAt),
    index('messages_org_idx').on(t.organizationId, t.deletedAt),
    index('messages_author_idx').on(t.authorId),
    index('messages_parent_idx').on(t.parentMessageId),
  ],
);

/**
 * A collaborative document. `yState` is the Yjs binary that Liveblocks syncs;
 * `contentText` is a plain-text mirror written on save so the doc is
 * searchable and embeddable without decoding the CRDT.
 */
export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    organizationId: organizationId(),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    parentDocumentId: uuid('parent_document_id').references((): AnyPgColumn => documents.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull().default('Untitled'),
    icon: text('icon'),
    yState: bytea('y_state'),
    contentText: text('content_text').notNull().default(''),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    /** Public read-only share token (P1); null while unpublished. */
    publicToken: text('public_token'),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('documents_org_idx').on(t.organizationId, t.deletedAt),
    index('documents_space_idx').on(t.spaceId, t.deletedAt),
    index('documents_project_idx').on(t.projectId, t.deletedAt),
    index('documents_parent_idx').on(t.parentDocumentId),
    uniqueIndex('documents_public_token_uq').on(t.publicToken),
    index('documents_creator_idx').on(t.createdById),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: primaryId(),
    organizationId: organizationId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    yState: bytea('y_state'),
    contentText: text('content_text').notNull().default(''),
    label: text('label'),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    ...createdOnly,
  },
  (t) => [
    index('document_versions_doc_idx').on(t.documentId, t.createdAt),
    index('document_versions_org_idx').on(t.organizationId),
    index('document_versions_creator_idx').on(t.createdById),
  ],
);

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
  parent: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: 'thread',
  }),
  replies: many(comments, { relationName: 'thread' }),
  mentions: many(mentions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  space: one(spaces, { fields: [documents.spaceId], references: [spaces.id] }),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  parent: one(documents, {
    fields: [documents.parentDocumentId],
    references: [documents.id],
    relationName: 'docTree',
  }),
  children: many(documents, { relationName: 'docTree' }),
  versions: many(documentVersions),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  project: one(projects, { fields: [channels.projectId], references: [projects.id] }),
  members: many(channelMembers),
  messages: many(messages),
}));
