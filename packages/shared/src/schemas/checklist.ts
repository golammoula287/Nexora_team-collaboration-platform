import { z } from 'zod';

/**
 * Checklists on a task.
 *
 * A task can carry several named checklists, each an ordered list of items.
 * Items order by the same fractional index as everything else, so ticking and
 * dragging never rewrites the whole list.
 */

const title = z.string().trim().min(1, 'Give it a title.').max(200, 'At most 200 characters.');

export const createChecklistSchema = z.object({
  title,
  /** Seed the checklist with items in one call - the common case. */
  items: z.array(title).max(50).optional(),
});

export const updateChecklistSchema = z.object({
  title: title.optional(),
});

export const createChecklistItemSchema = z.object({
  title,
  /** Insert after this item; omitted means append. */
  afterItemId: z.uuid().optional(),
});

export const updateChecklistItemSchema = z.object({
  title: title.optional(),
  isDone: z.boolean().optional(),
});

export const moveChecklistItemSchema = z.object({
  /** Moving between checklists on the same task is allowed. */
  checklistId: z.uuid().optional(),
  beforeItemId: z.uuid().nullable().optional(),
  afterItemId: z.uuid().nullable().optional(),
});

export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export type MoveChecklistItemInput = z.infer<typeof moveChecklistItemSchema>;
