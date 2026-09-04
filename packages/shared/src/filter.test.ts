import { describe, expect, it } from 'vitest';
import { countConditions, emptyFilter, matchesFilter, type FilterableTask } from './filter';
import { boundedFilterGroupSchema, type FilterGroup } from './schemas/view';

/**
 * The filter tree's semantics, pinned down.
 *
 * These are the cases any reimplementation would plausibly get wrong - negation
 * over a multi-valued field, an empty group, an undated task, dates compared as
 * plain strings - so they are the ones worth asserting before a second
 * implementation ever exists.
 */

function task(overrides: Partial<FilterableTask> = {}): FilterableTask {
  return {
    title: 'Write the exporter',
    statusId: 'col-1',
    priority: 'medium',
    dueDate: '2026-06-01',
    startDate: '2026-05-01',
    completedAt: null,
    assignees: [{ userId: 'ana' }],
    labelIds: [],
    ...overrides,
  };
}

describe('matchesFilter', () => {
  it('matches everything when there is no filter', () => {
    expect(matchesFilter(task(), undefined)).toBe(true);
    expect(matchesFilter(task(), emptyFilter())).toBe(true);
  });

  it('ands and ors', () => {
    const urgentOrOverdue: FilterGroup = {
      combinator: 'or',
      conditions: [
        { field: 'priority', operator: 'is', value: 'urgent' },
        { field: 'dueDate', operator: 'before', value: '2026-01-01' },
      ],
    };

    expect(matchesFilter(task({ priority: 'urgent' }), urgentOrOverdue)).toBe(true);
    expect(matchesFilter(task({ dueDate: '2025-12-31' }), urgentOrOverdue)).toBe(true);
    expect(matchesFilter(task(), urgentOrOverdue)).toBe(false);
  });

  it('nests a group inside a group', () => {
    const filter: FilterGroup = {
      combinator: 'and',
      conditions: [
        {
          combinator: 'or',
          conditions: [
            { field: 'priority', operator: 'is', value: 'urgent' },
            { field: 'priority', operator: 'is', value: 'high' },
          ],
        },
        { field: 'completed', operator: 'is', value: 'false' },
      ],
    };

    expect(matchesFilter(task({ priority: 'high' }), filter)).toBe(true);
    expect(matchesFilter(task({ priority: 'high', completedAt: '2026-06-02' }), filter)).toBe(false);
    expect(matchesFilter(task({ priority: 'low' }), filter)).toBe(false);
  });

  describe('multi-valued fields', () => {
    const twoAssignees = task({ assignees: [{ userId: 'ana' }, { userId: 'ben' }] });

    it('matches positively if any value matches', () => {
      expect(
        matchesFilter(twoAssignees, {
          combinator: 'and',
          conditions: [{ field: 'assigneeId', operator: 'is', value: 'ben' }],
        }),
      ).toBe(true);
    });

    it('requires every value to differ for a negative operator', () => {
      // "not assigned to Ana" is false for a task Ana is on, even though Ben is
      // also on it. Evaluating `is-not` with `some` would return true here,
      // which is the bug this asserts against.
      expect(
        matchesFilter(twoAssignees, {
          combinator: 'and',
          conditions: [{ field: 'assigneeId', operator: 'is-not', value: 'ana' }],
        }),
      ).toBe(false);

      expect(
        matchesFilter(twoAssignees, {
          combinator: 'and',
          conditions: [{ field: 'assigneeId', operator: 'is-not', value: 'cal' }],
        }),
      ).toBe(true);
    });

    it('treats no assignees as empty', () => {
      expect(
        matchesFilter(task({ assignees: [] }), {
          combinator: 'and',
          conditions: [{ field: 'assigneeId', operator: 'is-empty' }],
        }),
      ).toBe(true);
    });
  });

  describe('dates', () => {
    it('compares plain YYYY-MM-DD without constructing a Date', () => {
      const before: FilterGroup = {
        combinator: 'and',
        conditions: [{ field: 'dueDate', operator: 'before', value: '2026-06-01' }],
      };

      expect(matchesFilter(task({ dueDate: '2026-05-31' }), before)).toBe(true);
      // Strictly before: the boundary day is not before itself.
      expect(matchesFilter(task({ dueDate: '2026-06-01' }), before)).toBe(false);
      expect(matchesFilter(task({ dueDate: '2026-06-02' }), before)).toBe(false);
    });

    it('never matches an undated task on a date comparison', () => {
      for (const operator of ['before', 'after', 'on'] as const) {
        expect(
          matchesFilter(task({ dueDate: null }), {
            combinator: 'and',
            conditions: [{ field: 'dueDate', operator, value: '2026-06-01' }],
          }),
        ).toBe(false);
      }
    });
  });

  it('matches text case-insensitively', () => {
    expect(
      matchesFilter(task(), {
        combinator: 'and',
        conditions: [{ field: 'title', operator: 'contains', value: 'EXPORTER' }],
      }),
    ).toBe(true);
  });

  it('reads completion from completedAt, not from a separate flag', () => {
    const done: FilterGroup = {
      combinator: 'and',
      conditions: [{ field: 'completed', operator: 'is', value: 'true' }],
    };

    expect(matchesFilter(task({ completedAt: '2026-06-02' }), done)).toBe(true);
    expect(matchesFilter(task(), done)).toBe(false);
  });
});

describe('countConditions', () => {
  it('counts leaves across nested groups', () => {
    expect(
      countConditions({
        combinator: 'and',
        conditions: [
          { field: 'priority', operator: 'is', value: 'urgent' },
          {
            combinator: 'or',
            conditions: [
              { field: 'title', operator: 'contains', value: 'a' },
              { field: 'title', operator: 'contains', value: 'b' },
            ],
          },
        ],
      }),
    ).toBe(3);
  });

  it('counts nothing for an empty or absent filter', () => {
    expect(countConditions(undefined)).toBe(0);
    expect(countConditions(emptyFilter())).toBe(0);
  });
});

describe('the schema', () => {
  it('accepts a tree within the depth limit', () => {
    const nested: FilterGroup = {
      combinator: 'and',
      conditions: [
        {
          combinator: 'or',
          conditions: [
            {
              combinator: 'and',
              conditions: [{ field: 'priority', operator: 'is', value: 'urgent' }],
            },
          ],
        },
      ],
    };

    expect(boundedFilterGroupSchema.safeParse(nested).success).toBe(true);
  });

  it('refuses a tree nested past the limit', () => {
    const deep = (depth: number): unknown =>
      depth === 0
        ? { field: 'priority', operator: 'is', value: 'urgent' }
        : { combinator: 'and', conditions: [deep(depth - 1)] };

    // Not a filter anyone built by hand - a crafted payload, refused at the
    // boundary rather than recursed over.
    expect(boundedFilterGroupSchema.safeParse(deep(10)).success).toBe(false);
  });

  it('refuses an unknown field', () => {
    expect(
      boundedFilterGroupSchema.safeParse({
        combinator: 'and',
        conditions: [{ field: 'organizationId', operator: 'is', value: 'other-org' }],
      }).success,
    ).toBe(false);
  });
});
