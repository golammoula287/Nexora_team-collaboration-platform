import { z } from 'zod';
import { TASK_PRIORITIES, VIEW_LAYOUTS } from '../enums';

/**
 * The filter tree, and the saved views built on it.
 *
 * A filter is a tree of AND/OR groups rather than a flat list, because "urgent
 * OR overdue, and assigned to me" cannot be expressed as a list of clauses and
 * is the reason anyone asks for a filter builder in the first place.
 *
 * The tree is stored as `jsonb` on `saved_views` and evaluated by
 * `packages/shared/src/filter.ts`, which both apps import - so a saved view
 * cannot mean one thing where it is written and another where it is read.
 */

export const FILTER_FIELDS = [
  'title',
  'statusId',
  'priority',
  'assigneeId',
  'labelId',
  'dueDate',
  'startDate',
  'completed',
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const FILTER_OPERATORS = [
  'is',
  'is-not',
  'contains',
  'not-contains',
  'before',
  'after',
  'on',
  'is-empty',
  'is-not-empty',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Which operators make sense for which field, used by the builder's UI. */
export const OPERATORS_BY_FIELD: Record<FilterField, readonly FilterOperator[]> = {
  title: ['contains', 'not-contains', 'is', 'is-empty', 'is-not-empty'],
  statusId: ['is', 'is-not', 'is-empty'],
  priority: ['is', 'is-not'],
  assigneeId: ['is', 'is-not', 'is-empty', 'is-not-empty'],
  labelId: ['is', 'is-not', 'is-empty', 'is-not-empty'],
  dueDate: ['on', 'before', 'after', 'is-empty', 'is-not-empty'],
  startDate: ['on', 'before', 'after', 'is-empty', 'is-not-empty'],
  completed: ['is'],
};

export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  /**
   * Absent for `is-empty` / `is-not-empty`. Written `| undefined` explicitly
   * because under `exactOptionalPropertyTypes` a plain `?:` means "absent, or
   * a string" - which a Zod-parsed object, where the key is present and
   * undefined, does not satisfy.
   */
  value?: string | null | undefined;
}

export interface FilterGroup {
  combinator: 'and' | 'or';
  conditions: (FilterCondition | FilterGroup)[];
}

export function isFilterGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'combinator' in node;
}

const filterConditionSchema = z.object({
  field: z.enum(FILTER_FIELDS),
  operator: z.enum(FILTER_OPERATORS),
  value: z.string().max(200).nullable().optional(),
});

/**
 * Recursive, so it needs the explicit annotation - TypeScript cannot infer a
 * type that refers to itself through `z.lazy`.
 */
export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(['and', 'or']),
    conditions: z.array(z.union([filterConditionSchema, filterGroupSchema])).max(20),
  }),
);

/** Nesting past this is a crafted payload, not a filter someone built. */
const MAX_FILTER_DEPTH = 4;

function depthOf(node: FilterCondition | FilterGroup): number {
  if (!isFilterGroup(node)) return 1;
  return 1 + Math.max(0, ...node.conditions.map(depthOf));
}

export const boundedFilterGroupSchema = filterGroupSchema.refine(
  (group) => depthOf(group) <= MAX_FILTER_DEPTH,
  { message: `Filters can nest at most ${MAX_FILTER_DEPTH} levels deep.` },
);

/** The list view's columns, for saved column sets and stored widths. */
export const LIST_COLUMNS = ['task', 'column', 'priority', 'due', 'assignees'] as const;
export type ListColumn = (typeof LIST_COLUMNS)[number];

export const GROUP_KEYS = ['none', 'status', 'priority', 'assignee'] as const;
export const SORT_KEYS = ['position', 'title', 'priority', 'dueDate'] as const;

export const viewConfigSchema = z.object({
  filter: boundedFilterGroupSchema.optional(),
  groupBy: z.enum(GROUP_KEYS).default('none'),
  sortKey: z.enum(SORT_KEYS).default('position'),
  sortAscending: z.boolean().default(true),
  /** Omitted means all of them, in the declared order. */
  visibleColumns: z.array(z.enum(LIST_COLUMNS)).max(LIST_COLUMNS.length).optional(),
  /**
   * Pixel widths, keyed by column. Clamped so a column cannot be dragged to
   * nothing. `partialRecord`, not `record`: a saved view holds widths only for
   * the columns someone actually resized, and an exhaustive record would demand
   * a number for every column before it could be stored.
   */
  columnWidths: z.partialRecord(z.enum(LIST_COLUMNS), z.number().int().min(80).max(800)).optional(),
  /** Calendar only. */
  calendarSpan: z.enum(['month', 'week']).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

const viewName = z.string().trim().min(1, 'Give the view a name.').max(60);

export const createSavedViewSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  name: viewName,
  layout: z.enum(VIEW_LAYOUTS).default('board'),
  config: viewConfigSchema,
  /** Shared views are visible to the whole organization, not just their owner. */
  isShared: z.boolean().default(false),
  /** The view a project opens on. At most one per project per person. */
  isDefault: z.boolean().default(false),
});

export const updateSavedViewSchema = z.object({
  name: viewName.optional(),
  layout: z.enum(VIEW_LAYOUTS).optional(),
  config: viewConfigSchema.optional(),
  isShared: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const listSavedViewsQuerySchema = z.object({
  projectId: z.uuid().optional(),
});

export type ViewConfig = z.infer<typeof viewConfigSchema>;
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;
