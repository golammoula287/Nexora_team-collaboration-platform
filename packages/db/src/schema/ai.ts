import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdOnly, primaryId, timestamps } from '../columns.js';
import { user } from './auth.js';
import { aiRunKindEnum, entityTypeEnum } from './enums.js';
import { organizationId } from './org-column.js';

/** Embedding dimensions for Voyage voyage-3.5. Changing this needs a re-index. */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * `halfvec` is pgvector's 16-bit float vector: half the storage of `vector` at
 * effectively the same recall, which matters when every task, comment, doc and
 * file chunk in every org is indexed.
 */
const halfvec = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `halfvec(${config?.dimensions ?? EMBEDDING_DIMENSIONS})`;
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return JSON.parse(value) as number[];
  },
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * One row per indexed chunk of workspace content.
 *
 * Hybrid retrieval reads this table twice - HNSW over `embedding` for semantic
 * similarity, GIN over `searchVector` for BM25 - and fuses the two rankings
 * with Reciprocal Rank Fusion. Both halves filter on `organization_id` inside
 * the SQL; post-filtering in JS would leak another tenant's content into the
 * ranking even if it never reached the response.
 *
 * The HNSW and GIN indexes are created in the hand-written migration
 * `0001_search_and_rls.sql` - drizzle-kit does not emit operator classes for a
 * custom column type.
 */
export const embeddings = pgTable(
  'embeddings',
  {
    id: primaryId(),
    organizationId: organizationId(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    /** Position of this chunk within the source entity. */
    chunkIndex: integer('chunk_index').notNull().default(0),
    content: text('content').notNull(),
    embedding: halfvec('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    /** Maintained by Postgres, so it can never fall out of step with `content`. */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`to_tsvector('english', ${embeddings.content})`,
    ),
    model: text('model').notNull(),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('embeddings_entity_chunk_uq').on(t.entityType, t.entityId, t.chunkIndex),
    index('embeddings_org_idx').on(t.organizationId, t.entityType),
  ],
);

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title'),
    /** Set when the conversation is scoped to one project. */
    projectId: uuid('project_id'),
    ...timestamps,
  },
  (t) => [index('ai_conversations_org_user_idx').on(t.organizationId, t.userId, t.deletedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: primaryId(),
    organizationId: organizationId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    /** user | assistant | tool | system */
    role: text('role').notNull(),
    content: jsonb('content').notNull(),
    contentText: text('content_text').notNull().default(''),
    /** Tool calls and their schema-validated results. */
    toolCalls: jsonb('tool_calls'),
    /** Entities the answer cited, so the UI can link them. */
    citations: jsonb('citations'),
    ...createdOnly,
  },
  (t) => [
    index('ai_messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('ai_messages_org_idx').on(t.organizationId),
  ],
);

/**
 * One row per model call, written whether the call succeeded or not. This is
 * the meter behind per-org credits and the only place cost is measured.
 */
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: primaryId(),
    organizationId: organizationId(),
    /** The user the call is attributed to, including AI-initiated writes. */
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => aiConversations.id, {
      onDelete: 'set null',
    }),
    kind: aiRunKindEnum('kind').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms'),
    success: boolean('success').notNull().default(true),
    error: text('error'),
    ...createdOnly,
  },
  (t) => [
    index('ai_runs_org_created_idx').on(t.organizationId, t.createdAt),
    index('ai_runs_user_idx').on(t.userId),
    index('ai_runs_model_idx').on(t.model),
    index('ai_runs_conversation_idx').on(t.conversationId),
  ],
);

/** Per-org spend ceiling for a billing period, enforced before each call. */
export const aiCredits = pgTable(
  'ai_credits',
  {
    id: primaryId(),
    organizationId: organizationId(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    limitUsd: numeric('limit_usd', { precision: 12, scale: 2 }).notNull(),
    usedUsd: numeric('used_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    ...timestamps,
  },
  (t) => [uniqueIndex('ai_credits_org_period_uq').on(t.organizationId, t.periodStart)],
);

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(user, { fields: [aiConversations.userId], references: [user.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));
