import { z } from 'zod';
import { projectKeySchema } from './project';

/**
 * Turning one thing into another.
 *
 * Both conversions keep a link back to the source rather than moving it: a
 * comment that became a task is still the comment someone wrote, and a task
 * promoted to a project is still where the discussion happened. Deleting the
 * source would otherwise take the context with it.
 */

export const commentToTaskSchema = z.object({
  projectId: z.uuid(),
  statusId: z.uuid().optional(),
  /** Defaults to the comment's first line. */
  title: z.string().trim().min(1).max(200).optional(),
  assigneeIds: z.array(z.uuid()).max(20).optional(),
});

export const taskToProjectSchema = z.object({
  spaceId: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  key: projectKeySchema,
  /** Subtasks become the new project's top-level tasks. */
  moveSubtasks: z.boolean().default(true),
});

export type CommentToTaskInput = z.infer<typeof commentToTaskSchema>;
export type TaskToProjectInput = z.infer<typeof taskToProjectSchema>;
