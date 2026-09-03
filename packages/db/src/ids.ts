import { uuidv7 } from 'uuidv7';

/**
 * UUID v7: time-ordered, so primary-key inserts stay sequential and B-tree
 * indexes do not fragment the way random v4 keys do. Sortable by creation time
 * without a separate column.
 */
export function newId(): string {
  return uuidv7();
}

/** True for a syntactically valid UUID of any version. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
