/**
 * Fractional indexing.
 *
 * Rows carry a lexicographically sortable string rather than an integer, so
 * moving one item writes ONE row instead of renumbering everything after it.
 * The legacy app reindexed whole columns on every drag.
 *
 * The keys are ordinary strings ordered by `<`, so Postgres sorts them with a
 * plain B-tree index and no special collation.
 *
 * The midpoint algorithm is the well-known one from David Greenspan's
 * fractional-indexing note, followed closely rather than improvised: the
 * edge cases (adjacent digits, shared prefixes, the implicit trailing zero)
 * are exactly where a hand-rolled version goes wrong, and a broken ordering
 * key corrupts a board silently.
 */

/** Digits in ASCII order, so string comparison and intended order agree. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const ZERO = DIGITS[0] as string;

function digitAt(key: string, index: number): number {
  const character = key[index];
  if (character === undefined) return 0; // keys are implicitly zero-padded
  const value = DIGITS.indexOf(character);
  if (value === -1) throw new Error(`"${character}" is not a valid ordering-key character`);
  return value;
}

function assertValid(key: string, label: string): void {
  if (key.length === 0) throw new Error(`${label} must not be empty`);
  for (const character of key) {
    if (DIGITS.indexOf(character) === -1) {
      throw new Error(`${label} "${key}" contains an invalid character`);
    }
  }
  // A trailing zero is ambiguous: "a" and "a0" would compare unequal while
  // meaning the same position, so keys are kept in a canonical form without one.
  if (key.endsWith(ZERO)) {
    throw new Error(`${label} "${key}" must not end with "0"`);
  }
}

/**
 * A key strictly between `before` and `after`, where `null` means "no bound".
 * Both are treated as implicitly padded with zeros to any length.
 */
function midpoint(before: string, after: string | null): string {
  if (after !== null && before >= after) {
    throw new Error(`"${before}" is not before "${after}"`);
  }

  if (after !== null) {
    // Copy the shared prefix; only the first difference decides anything.
    let shared = 0;
    while ((before[shared] ?? ZERO) === after[shared]) shared += 1;
    if (shared > 0) {
      return after.slice(0, shared) + midpoint(before.slice(shared), after.slice(shared));
    }
  }

  const low = before === '' ? 0 : digitAt(before, 0);
  const high = after !== null && after !== '' ? digitAt(after, 0) : BASE;

  if (high - low > 1) {
    // Room for a whole digit between them.
    return DIGITS[Math.round(0.5 * (low + high))] as string;
  }

  if (after !== null && after.length > 1) {
    // The neighbours are adjacent digits, but `after` has a tail: take its
    // first digit and let the next level separate them.
    return after.slice(0, 1);
  }

  // Adjacent with no room above: keep this digit and descend.
  return (DIGITS[low] as string) + midpoint(before.slice(1), null);
}

/**
 * A key strictly between `before` and `after`.
 *
 *   keyBetween(null, null)   -> the first key in an empty list
 *   keyBetween(last, null)   -> append
 *   keyBetween(null, first)  -> prepend
 *   keyBetween(a, b)         -> insert between two neighbours
 *
 * Keys lengthen as a gap is subdivided, which is the price of never touching
 * another row.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null) assertValid(before, 'before');
  if (after !== null) assertValid(after, 'after');

  if (before !== null && after !== null && before >= after) {
    throw new Error(`"${before}" is not before "${after}"`);
  }

  return midpoint(before ?? '', after);
}

/**
 * Digits with '0' removed, for `nthPosition`.
 *
 * A canonical key may not end in '0' (see `assertValid`), and counting in
 * base 62 produces one every 62nd item - starting with the very first, since
 * `nthPosition(0)` used to yield "10". Any list seeded that way had a first
 * element that `keyBetween` refused as a neighbour, so it could never be
 * reordered. Counting in base 61 with no zero digit makes a trailing zero
 * unrepresentable rather than merely unlikely.
 */
const NONZERO_DIGITS = DIGITS.slice(1);
const NONZERO_BASE = NONZERO_DIGITS.length;

/**
 * The nth key in a stable ascending sequence.
 *
 * For seeds and fixtures, where the whole list is known up front. Repeatedly
 * calling `keyBetween(previous, null)` would work but converges towards 'z' and
 * lengthens the keys; this stays short and is O(1) per item.
 *
 * Every key it returns is a valid `keyBetween` neighbour - asserted in the
 * tests, because the two functions being subtly incompatible is exactly the
 * kind of thing that only shows up on the first drag.
 */
export function nthPosition(n: number): string {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error(`nthPosition expects a non-negative integer, got ${n}`);
  }

  let remaining = n;
  let out = '';
  do {
    out = (NONZERO_DIGITS[remaining % NONZERO_BASE] as string) + out;
    remaining = Math.floor(remaining / NONZERO_BASE);
  } while (remaining > 0);

  // Prefix with the length so shorter keys sort before longer ones.
  return `${DIGITS[out.length] as string}${out}`;
}

/** `count` ordered keys, for seeding a list in one go. */
export function keySequence(count: number): string[] {
  return Array.from({ length: count }, (_, i) => nthPosition(i));
}
