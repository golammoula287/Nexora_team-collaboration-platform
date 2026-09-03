import { describe, expect, it } from 'vitest';
import { keyBetween, keySequence, nthPosition } from '../src/ordering.js';

/**
 * Fractional indexing is the thing that makes a drag write one row instead of
 * renumbering a column, so it is worth testing as a property rather than by
 * example: whatever the sequence of moves, the keys must stay in order.
 */

describe('keyBetween', () => {
  it('starts in the middle of the range, leaving room on both sides', () => {
    const first = keyBetween(null, null);

    // Not the lowest possible key: starting at the midpoint means the first
    // prepend and the first append are both cheap.
    expect(keyBetween(null, first) < first).toBe(true);
    expect(keyBetween(first, null) > first).toBe(true);
  });

  it('appends after a key', () => {
    const first = keyBetween(null, null);
    const second = keyBetween(first, null);

    expect(second > first).toBe(true);
  });

  it('prepends before a key', () => {
    const first = keyBetween(null, null);
    const before = keyBetween(null, first);

    expect(before < first).toBe(true);
  });

  it('inserts strictly between two neighbours', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const middle = keyBetween(a, b);

    expect(a < middle).toBe(true);
    expect(middle < b).toBe(true);
  });

  it('refuses keys given in the wrong order', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);

    expect(() => keyBetween(b, a)).toThrow(/not before/);
  });

  it('refuses a malformed key rather than producing a bad one', () => {
    expect(() => keyBetween('a!', null)).toThrow();
    // A trailing zero is ambiguous - "a" and "a0" would compare unequal while
    // meaning the same position.
    expect(() => keyBetween('a0', null)).toThrow(/must not end/);
  });
});

describe('repeated insertion at the same point', () => {
  it('stays ordered after 200 inserts between the same pair', () => {
    // The worst case for fractional indexing: always dropping into the same
    // gap. Keys get longer; they must never collide or invert.
    let low = keyBetween(null, null);
    const high = keyBetween(low, null);
    const generated: string[] = [];

    for (let i = 0; i < 200; i += 1) {
      const next = keyBetween(low, high);
      expect(next > low, `insert ${i}: ${next} should be after ${low}`).toBe(true);
      expect(next < high, `insert ${i}: ${next} should be before ${high}`).toBe(true);
      generated.push(next);
      low = next;
    }

    expect(new Set(generated).size).toBe(generated.length);
  });

  it('stays ordered when always prepending', () => {
    let first = keyBetween(null, null);
    const seen: string[] = [first];

    for (let i = 0; i < 100; i += 1) {
      const next = keyBetween(null, first);
      expect(next < first).toBe(true);
      first = next;
      seen.push(next);
    }

    const sorted = [...seen].sort();
    expect(sorted).toEqual([...seen].reverse());
  });

  it('stays ordered when always appending', () => {
    const keys = keySequence(500);

    expect(new Set(keys).size).toBe(500);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('a simulated board', () => {
  it('keeps a list ordered through 300 random moves', () => {
    // Closer to what the board actually does: pick a card, drop it somewhere
    // else, repeat. String order must always match the intended order.
    const list = keySequence(12);

    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let move = 0; move < 300; move += 1) {
      const from = Math.floor(random() * list.length);
      const [moved] = list.splice(from, 1);
      expect(moved).toBeDefined();

      const to = Math.floor(random() * (list.length + 1));
      const before = to > 0 ? (list[to - 1] as string) : null;
      const after = to < list.length ? (list[to] as string) : null;

      list.splice(to, 0, keyBetween(before, after));

      expect([...list].sort(), `order broke on move ${move}`).toEqual(list);
      expect(new Set(list).size, `duplicate key on move ${move}`).toBe(list.length);
    }
  });
});

describe('nthPosition', () => {
  it('generates an ascending sequence', () => {
    const keys = Array.from({ length: 300 }, (_, i) => nthPosition(i));

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses a negative or fractional index', () => {
    expect(() => nthPosition(-1)).toThrow();
    expect(() => nthPosition(1.5)).toThrow();
  });
});
