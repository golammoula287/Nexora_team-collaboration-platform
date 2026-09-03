import { z } from 'zod';
import { TASK_TITLE_MAX } from '../constants';
import { DEPENDENCY_TYPES, TASK_PRIORITIES } from '../enums';

/**
 * Task request shapes, shared by the API's validator and the frontend's forms.
 */

const title = z
  .string()
  .trim()
  .min(1, 'Give it a title.')
  .max(TASK_TITLE_MAX, `At most ${TASK_TITLE_MAX} characters.`);

/** YYYY-MM-DD; the columns are `date`, so a time would be discarded anyway. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD form.');

export const createTaskSchema = z
  .object({
    projectId: z.uuid(),
    title,
    /** Plain text for now; the rich editor lands with documents in phase 5. */
    description: z.string().max(20_000).optional(),
    statusId: z.uuid().optional(),
    priority: z.enum(TASK_PRIORITIES).default('none'),
    /** Unlimited depth - a real self-reference, not a flat embedded array. */
    parentTaskId: z.uuid().optional(),
    sprintId: z.uuid().optional(),
    milestoneId: z.uuid().optional(),
    startDate: isoDate.optional(),
    dueDate: isoDate.optional(),
    estimateMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 365)
      .optional(),
    assigneeIds: z.array(z.uuid()).max(20).optional(),
    labelIds: z.array(z.uuid()).max(20).optional(),
    /** Insert after this sibling; omitted means append to the end. */
    afterTaskId: z.uuid().optional(),
  })
  .refine((value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate, {
    message: 'The due date cannot be before the start date.',
    path: ['dueDate'],
  });

export const updateTaskSchema = z.object({
  title: title.optional(),
  description: z.string().max(20_000).nullable().optional(),
  statusId: z.uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  parentTaskId: z.uuid().nullable().optional(),
  sprintId: z.uuid().nullable().optional(),
  milestoneId: z.uuid().nullable().optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  estimateMinutes: z.number().int().min(0).nullable().optional(),
  assigneeIds: z.array(z.uuid()).max(20).optional(),
  labelIds: z.array(z.uuid()).max(20).optional(),
});

/**
 * A drag: where the task landed. `beforeTaskId`/`afterTaskId` are its new
 * neighbours, which is all fractional indexing needs - no other row moves.
 */
export const moveTaskSchema = z.object({
  statusId: z.uuid().nullable().optional(),
  beforeTaskId: z.uuid().nullable().optional(),
  afterTaskId: z.uuid().nullable().optional(),
});

export const createDependencySchema = z.object({
  dependsOnTaskId: z.uuid(),
  type: z.enum(DEPENDENCY_TYPES).default('blocks'),
});

export const listTasksQuerySchema = z.object({
  projectId: z.uuid().optional(),
  statusId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  parentTaskId: z.uuid().optional(),
  /** Only top-level tasks, i.e. those with no parent. */
  topLevelOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
  search: z.string().max(200).optional(),
});

export const bulkUpdateTasksSchema = z.object({
  taskIds: z.array(z.uuid()).min(1, 'Select at least one task.').max(200),
  patch: z.object({
    statusId: z.uuid().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: isoDate.nullable().optional(),
    addLabelIds: z.array(z.uuid()).max(20).optional(),
    assigneeIds: z.array(z.uuid()).max(20).optional(),
  }),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export type BulkUpdateTasksInput = z.infer<typeof bulkUpdateTasksSchema>;
