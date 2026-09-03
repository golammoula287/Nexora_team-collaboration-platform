import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { newId } from './ids.js';

/**
 * Column builders shared by every table. Using these instead of hand-writing
 * each column is what makes the invariants in CLAUDE.md mechanical rather than
 * remembered.
 */

/** UUID v7 primary key, generated in the application. */
export const primaryId = () => uuid('id').primaryKey().$defaultFn(newId);

/**
 * Never `new Date()` as a default - that is evaluated once at module load and
 * every row gets the process start time. This is the bug the legacy app shipped
 * on `task.date`. `defaultNow()` renders as SQL `now()`.
 */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Soft delete. Hard deletes happen only in the Trash cleanup job. */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true, mode: 'date' });

/** Every domain table carries these three. */
export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
};

/** Timestamps for join/child tables that are hard-deleted with their parent. */
export const createdOnly = {
  createdAt: createdAt(),
};

/** `now()` for use inside raw SQL defaults. */
export const nowSql = sql`now()`;
