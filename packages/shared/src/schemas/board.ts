import { z } from 'zod';
import { STATUS_CATEGORIES } from '../enums';

/**
 * Board columns.
 *
 * A column is a `task_statuses` row. Its *name* is what people read; its
 * *category* is what the product acts on - dragging a card into a column whose
 * category is `done` is what completing a task means (decision #60). The two
 * are separate so a team can call their done column "Shipped" without the
 * completion logic caring.
 */

const columnName = z
  .string()
  .trim()
  .min(1, 'Give the column a name.')
  .max(48, 'At most 48 characters.');

export const createColumnSchema = z.object({
  name: columnName,
  category: z.enum(STATUS_CATEGORIES).default('todo'),
  color: z.string().max(32).optional(),
  /** null means unlimited. */
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
  /** Insert after this column; omitted means append to the end. */
  afterColumnId: z.uuid().optional(),
});

export const updateColumnSchema = z.object({
  name: columnName.optional(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  color: z.string().max(32).nullable().optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

/** Where the column landed. Its new neighbours, as with tasks. */
export const moveColumnSchema = z.object({
  beforeColumnId: z.uuid().nullable().optional(),
  afterColumnId: z.uuid().nullable().optional(),
});

/**
 * Deleting a column has to say where its cards go.
 *
 * A column holding tasks cannot simply vanish - the tasks would be left with a
 * dangling `statusId` and appear in no column at all. The caller names the
 * column that inherits them, in the same transaction.
 */
export const deleteColumnSchema = z.object({
  moveTasksToColumnId: z.uuid().optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type MoveColumnInput = z.infer<typeof moveColumnSchema>;
export type DeleteColumnInput = z.infer<typeof deleteColumnSchema>;
