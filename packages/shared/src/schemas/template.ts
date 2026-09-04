import { z } from 'zod';
import { projectKeySchema } from './project';

/**
 * Templates and duplication.
 *
 * A template is a `templates` row whose `payload` is a snapshot, not a live
 * link: applying one copies values in and then forgets where they came from.
 * Editing a template must not silently rewrite work already created from it,
 * which is what a live reference would do.
 */

const name = z.string().trim().min(1, 'Give it a name.').max(100);
const description = z.string().trim().max(2000).optional();

/** Save an existing task, with its checklists and subtasks, as a template. */
export const createTaskTemplateSchema = z.object({
  taskId: z.uuid(),
  name,
  description,
});

/** Save an existing project's columns - and optionally its tasks - as a template. */
export const createProjectTemplateSchema = z.object({
  projectId: z.uuid(),
  name,
  description,
  includeTasks: z.boolean().default(false),
});

export const applyTaskTemplateSchema = z.object({
  projectId: z.uuid(),
  statusId: z.uuid().optional(),
  parentTaskId: z.uuid().optional(),
  /** Override the template's title for this one task. */
  title: z.string().trim().min(1).max(200).optional(),
});

export const applyProjectTemplateSchema = z.object({
  spaceId: z.uuid(),
  name,
  key: projectKeySchema,
});

/** Copy a project. Columns always; tasks only if asked. */
export const duplicateProjectSchema = z.object({
  name,
  key: projectKeySchema,
  spaceId: z.uuid().optional(),
  includeTasks: z.boolean().default(false),
});

/**
 * What a template actually stores.
 *
 * `templates.payload` is `jsonb`, so it comes back as `unknown`. Parsing it on
 * read rather than casting it means a template written by an older version of
 * the app, or edited by hand, fails loudly at the boundary instead of producing
 * a half-built project. This is the same argument as validating a request body.
 */
const templateChecklist = z.object({
  title: z.string().max(200),
  items: z.array(z.string().max(200)).max(50),
});

const templateSubtask = z.object({
  title: z.string().max(200),
  priority: z.string().max(20),
});

export const taskTemplatePayloadSchema = z.object({
  title: z.string().max(200),
  description: z.string().nullable(),
  priority: z.string().max(20),
  estimateMinutes: z.number().int().nullable(),
  checklists: z.array(templateChecklist).max(20),
  subtasks: z.array(templateSubtask).max(100),
});

export const projectTemplatePayloadSchema = z.object({
  columns: z
    .array(
      z.object({
        name: z.string().max(48),
        category: z.string().max(20),
        color: z.string().max(32).nullable(),
        wipLimit: z.number().int().nullable(),
      }),
    )
    .min(1)
    .max(20),
  tasks: z
    .array(
      z.object({
        title: z.string().max(200),
        priority: z.string().max(20),
        /** Index into `columns`, so a template survives being renamed. */
        columnIndex: z.number().int().min(0),
        subtasks: z.array(templateSubtask).max(50),
      }),
    )
    .max(500)
    .default([]),
});

export type TaskTemplatePayload = z.infer<typeof taskTemplatePayloadSchema>;
export type ProjectTemplatePayload = z.infer<typeof projectTemplatePayloadSchema>;

export const listTemplatesQuerySchema = z.object({
  kind: z.enum(['task', 'project']).optional(),
});

export type CreateTaskTemplateInput = z.infer<typeof createTaskTemplateSchema>;
export type CreateProjectTemplateInput = z.infer<typeof createProjectTemplateSchema>;
export type ApplyTaskTemplateInput = z.infer<typeof applyTaskTemplateSchema>;
export type ApplyProjectTemplateInput = z.infer<typeof applyProjectTemplateSchema>;
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>;
