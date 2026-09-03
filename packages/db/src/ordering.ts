/**
 * Ordering keys.
 *
 * Rows carry a lexicographically sortable string rather than an integer, so
 * moving one item writes one row instead of renumbering everything after it.
 * The legacy app reindexed whole columns on every drag.
 *
 * Phase 4 adds `keyBetween(a, b)` for real drag-and-drop. This file currently
 * holds only what seeding and initial inserts need: evenly spaced keys.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * The nth key in a stable ascending sequence. Zero-padded so string comparison
 * and numeric order agree past the first 62 items.
 */
export function nthPosition(n: number): string {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error(`nthPosition expects a non-negative integer, got ${n}`);
  }

  let remaining = n;
  let out = '';
  do {
    out = DIGITS[remaining % 62] + out;
    remaining = Math.floor(remaining / 62);
  } while (remaining > 0);

  // Prefix with the length so shorter keys always sort before longer ones.
  return `${DIGITS[out.length]}${out}`;
}
