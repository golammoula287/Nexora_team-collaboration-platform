import {
  isFilterGroup,
  type FilterCondition,
  type FilterGroup,
  type FilterOperator,
} from './schemas/view';

/**
 * Evaluating a filter tree.
 *
 * Where this runs, and why: a project view already loads that project's tasks -
 * the board needs all of them to draw the columns - and those rows arrived
 * org-scoped and project-scoped from SQL. Narrowing that set by priority or due
 * date is arranging what is already in hand, so it happens here.
 *
 * The tenancy rule is untouched by that: the organization predicate is in the
 * WHERE clause of the query that fetched these rows, never applied afterwards
 * (CLAUDE.md). This file only ever sees rows the caller was already entitled to.
 *
 * When the task list grows past what a page should load - pagination, or a
 * saved view applied across projects - the tree will need compiling to SQL as
 * well. This file is then the specification for that: one definition of what a
 * saved filter means, so the two implementations cannot disagree.
 *
 * Browser-safe by rule: no `node:` imports, no database, and no `Date` - plain
 * YYYY-MM-DD string comparison, which is what the columns hold.
 */

export interface FilterableTask {
  title: string;
  statusId: string | null;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  assignees: { userId: string }[];
  labelIds?: string[];
}

/** The values a single field contributes. Multi-valued fields return several. */
function valuesOf(task: FilterableTask, field: FilterCondition['field']): (string | null)[] {
  switch (field) {
    case 'title':
      return [task.title];
    case 'statusId':
      return [task.statusId];
    case 'priority':
      return [task.priority];
    case 'assigneeId':
      return task.assignees.length > 0 ? task.assignees.map((a) => a.userId) : [null];
    case 'labelId':
      return task.labelIds && task.labelIds.length > 0 ? task.labelIds : [null];
    case 'dueDate':
      return [task.dueDate];
    case 'startDate':
      return [task.startDate];
    case 'completed':
      return [task.completedAt ? 'true' : 'false'];
  }
}

function compare(actual: string | null, operator: FilterOperator, expected: string | null): boolean {
  switch (operator) {
    case 'is-empty':
      return actual === null || actual === '';
    case 'is-not-empty':
      return actual !== null && actual !== '';
    case 'is':
      return actual === expected;
    case 'is-not':
      return actual !== expected;
    case 'contains':
      return (actual ?? '').toLowerCase().includes((expected ?? '').toLowerCase());
    case 'not-contains':
      return !(actual ?? '').toLowerCase().includes((expected ?? '').toLowerCase());
    // Dates are plain YYYY-MM-DD, so lexicographic order is chronological
    // order. No Date object is constructed, and no timezone can shift a day.
    case 'on':
      return actual !== null && expected !== null && actual === expected;
    case 'before':
      return actual !== null && expected !== null && actual < expected;
    case 'after':
      return actual !== null && expected !== null && actual > expected;
  }
}

export function matchesCondition(task: FilterableTask, condition: FilterCondition): boolean {
  const values = valuesOf(task, condition.field);
  const expected = condition.value ?? null;

  // A multi-valued field matches if any of its values does - except for the
  // negative operators, where "not assigned to Ana" must hold for every
  // assignee, not just one of them.
  if (condition.operator === 'is-not' || condition.operator === 'not-contains') {
    return values.every((value) => compare(value, condition.operator, expected));
  }
  return values.some((value) => compare(value, condition.operator, expected));
}

export function matchesFilter(task: FilterableTask, group: FilterGroup | undefined): boolean {
  if (!group || group.conditions.length === 0) return true;

  const results = group.conditions.map((node) =>
    isFilterGroup(node) ? matchesFilter(task, node) : matchesCondition(task, node),
  );

  return group.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

/** An empty group, for seeding a new filter in the builder. */
export function emptyFilter(): FilterGroup {
  return { combinator: 'and', conditions: [] };
}

/** How many conditions a tree holds, for the "N filters" badge. */
export function countConditions(group: FilterGroup | undefined): number {
  if (!group) return 0;
  return group.conditions.reduce(
    (total, node) => total + (isFilterGroup(node) ? countConditions(node) : 1),
    0,
  );
}
