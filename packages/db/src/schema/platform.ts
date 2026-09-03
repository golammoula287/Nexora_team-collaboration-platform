import {
  boolean,
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
import { organizationId } from './org-column.js';

/**
 * A connected third-party account. Tokens are encrypted at rest with
 * ENCRYPTION_KEY before they reach this table - the column holds ciphertext,
 * never a usable credential.
 */
export const integrations = pgTable(
  'integrations',
  {
    id: primaryId(),
    organizationId: organizationId(),
    /** slack | github | gitlab | google | outlook | dropbox | figma */
    provider: text('provider').notNull(),
    externalAccountId: text('external_account_id'),
    displayName: text('display_name'),
    /** Encrypted. Never log or return this column. */
    credentials: text('credentials'),
    config: jsonb('config'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    connectedById: uuid('connected_by_id').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('integrations_org_provider_uq').on(t.organizationId, t.provider),
    index('integrations_org_idx').on(t.organizationId, t.isEnabled),
    index('integrations_connector_idx').on(t.connectedById),
  ],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: primaryId(),
    organizationId: organizationId(),
    url: text('url').notNull(),
    /** Events this endpoint subscribes to, e.g. `task.created`. */
    events: text('events').array().notNull(),
    /** Shared secret used to sign the payload. Encrypted at rest. */
    secret: text('secret').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('webhooks_org_idx').on(t.organizationId, t.isEnabled, t.deletedAt),
    index('webhooks_creator_idx').on(t.createdById),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: primaryId(),
    organizationId: organizationId(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    attempt: integer('attempt').notNull().default(1),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true, mode: 'date' }),
    error: text('error'),
    ...createdOnly,
  },
  (t) => [
    index('webhook_deliveries_webhook_idx').on(t.webhookId, t.createdAt),
    index('webhook_deliveries_retry_idx').on(t.nextRetryAt),
    index('webhook_deliveries_org_idx').on(t.organizationId),
  ],
);

/**
 * Plan-limit counters (seats, storage, automation runs, guests). Kept as one
 * row per org per metric per period so a limit check is a single indexed read
 * rather than an aggregate over the whole table it measures.
 */
export const usageCounters = pgTable(
  'usage_counters',
  {
    id: primaryId(),
    organizationId: organizationId(),
    metric: text('metric').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
    value: integer('value').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('usage_counters_uq').on(t.organizationId, t.metric, t.periodStart)],
);

/**
 * Feature flags. A null `organizationId` is the global default; an org row
 * overrides it. This is the one table where the tenant column is nullable, so
 * it is deliberately excluded from `withOrg()`'s table constraint.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: primaryId(),
    organizationId: uuid('organization_id'),
    key: text('key').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    config: jsonb('config'),
    ...timestamps,
  },
  (t) => [uniqueIndex('feature_flags_org_key_uq').on(t.organizationId, t.key)],
);
