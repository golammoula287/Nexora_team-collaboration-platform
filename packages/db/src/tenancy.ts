import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { AnyDatabase, Transaction } from './client.js';

/**
 * TENANCY.
 *
 * The rule from CLAUDE.md: every read and write on a domain table goes through
 * `withOrg(orgId)`, and the organization predicate lives inside the SQL rather
 * than being applied in JS after the fetch.
 *
 * This file makes that mechanical rather than remembered. `withOrg` accepts
 * only tables that carry an `organizationId` column, so handing it `user` or
 * `session` is a compile error, and every query it builds carries the org
 * predicate. Filtering after the fetch is not something you can express here.
 */

/** A table that participates in tenancy: it has an organization column. */
export interface OrgTable extends PgTable {
  organizationId: PgColumn;
}

/** A tenant table that is also soft-deletable. */
export interface SoftDeletableOrgTable extends OrgTable {
  deletedAt: PgColumn;
  id: PgColumn;
}

function hasDeletedAt(table: OrgTable): table is SoftDeletableOrgTable {
  return 'deletedAt' in table && table.deletedAt !== undefined;
}

export interface OrgScope {
  readonly organizationId: string;

  /**
   * The org predicate for `table`, ANDed with any extra conditions and - unless
   * `includeDeleted` is set - with `deleted_at is null`.
   *
   * Use this whenever you need a query shape `find` cannot express. It is the
   * escape hatch that still cannot forget the tenant.
   */
  where(table: OrgTable, ...conditions: (SQL | undefined)[]): SQL;
  whereIncludingDeleted(table: OrgTable, ...conditions: (SQL | undefined)[]): SQL;

  /** Values with `organizationId` forced to this scope's org. */
  values<T extends Record<string, unknown>>(input: T): T & { organizationId: string };

  /**
   * Run `fn` in a transaction with `app.org_id` set, so the RLS policies apply
   * as defence in depth for the duration. Every multi-step write uses this.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

/**
 * Bind a database handle to one organization.
 *
 *   const scope = withOrg(db, orgId);
 *   await db.select().from(tasks).where(scope.where(tasks, eq(tasks.projectId, id)));
 *   await db.insert(tasks).values(scope.values({ title, projectId, ... }));
 */
export function withOrg(db: AnyDatabase, organizationId: string): OrgScope {
  if (!organizationId) {
    // An empty string would silently match nothing, or - worse, with a bad
    // predicate - everything. Fail here instead.
    throw new Error('withOrg() requires an organization id');
  }

  const orgPredicate = (table: OrgTable): SQL => eq(table.organizationId, organizationId) as SQL;

  const build = (table: OrgTable, conditions: (SQL | undefined)[], includeDeleted: boolean) => {
    const parts: (SQL | undefined)[] = [orgPredicate(table)];
    if (!includeDeleted && hasDeletedAt(table)) {
      parts.push(isNull(table.deletedAt));
    }
    parts.push(...conditions);
    // `and` of a non-empty list is always defined.
    return and(...parts) as SQL;
  };

  return {
    organizationId,

    where(table, ...conditions) {
      return build(table, conditions, false);
    },

    whereIncludingDeleted(table, ...conditions) {
      return build(table, conditions, true);
    },

    values(input) {
      return { ...input, organizationId };
    },

    async transaction(fn) {
      return db.transaction(async (tx) => {
        // Scopes the RLS policies for this transaction only. `set_config` with
        // is_local = true is the parameterised form of `SET LOCAL`, which does
        // not accept a bind parameter.
        await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
        return fn(tx);
      });
    },
  };
}

/**
 * Soft delete rather than removing the row. Hard deletes happen only in the
 * Trash cleanup job.
 */
export function softDeletePatch(): { deletedAt: Date } {
  return { deletedAt: new Date() };
}
