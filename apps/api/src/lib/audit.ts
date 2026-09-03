import { schema, type Transaction } from '@nexora/db';

/**
 * Writes the audit row for a mutation.
 *
 * Called inside the same transaction as the change it records, so "it happened"
 * and "what happened" cannot disagree. Every mutation writes one (CLAUDE.md).
 */
export interface AuditEntry {
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: (typeof schema.entityTypeEnum.enumValues)[number];
  entityId: string;
  /** Changed fields only, as `{ field: { from, to } }`. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  /** True when the AI made the write on the user's behalf. */
  onBehalfOfAi?: boolean;
}

export async function recordActivity(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.insert(schema.activities).values({
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    onBehalfOfAi: entry.onBehalfOfAi ?? false,
  });
}

/** Pulls the client address and agent off a request, for the audit row. */
export function requestMeta(headers: Headers): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const forwarded = headers.get('x-forwarded-for');
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  };
}
