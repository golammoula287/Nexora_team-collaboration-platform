import { z } from 'zod';
import { PROJECT_KEY_MAX, PROJECT_KEY_MIN, PROJECT_KEY_PATTERN } from '../constants';
import { PROJECT_STATUSES, PROJECT_VISIBILITIES } from '../enums';

/**
 * Request shapes for spaces and projects, used by the API's `zValidator` and by
 * the frontend's forms. Defined once so the two cannot disagree (decision #19).
 */

const name = z.string().trim().min(1, 'Give it a name.').max(100, 'At most 100 characters.');
const description = z.string().trim().max(2000).optional();

/** YYYY-MM-DD. The column is `date`, so time-of-day would be discarded anyway. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD form.')
  .optional();

export const spaceSlugSchema = z
  .string()
  .trim()
  .min(1, 'Give it an address.')
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case letters, numbers and hyphens only.');

export const createSpaceSchema = z.object({
  name,
  slug: spaceSlugSchema,
  description,
  icon: z.string().max(32).optional(),
  color: z.string().max(32).optional(),
});

export const updateSpaceSchema = createSpaceSchema.partial();

/**
 * The project key prefixes every task id, as in ACME-123. Upper-case and short
 * because people type and say it.
 */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(PROJECT_KEY_MIN, `At least ${PROJECT_KEY_MIN} characters.`)
  .max(PROJECT_KEY_MAX, `At most ${PROJECT_KEY_MAX} characters.`)
  .regex(PROJECT_KEY_PATTERN, 'Start with a letter; upper-case letters and numbers only.');

export const createProjectSchema = z
  .object({
    spaceId: z.uuid('Choose a space.'),
    name,
    key: projectKeySchema,
    description,
    status: z.enum(PROJECT_STATUSES).default('planning'),
    visibility: z.enum(PROJECT_VISIBILITIES).default('org'),
    startDate: isoDate,
    dueDate: isoDate,
    ownerId: z.uuid().optional(),
    color: z.string().max(32).optional(),
    icon: z.string().max(32).optional(),
  })
  .refine((value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate, {
    message: 'The due date cannot be before the start date.',
    path: ['dueDate'],
  });

/**
 * Update takes the same fields, all optional. Written out rather than
 * `.partial()` because a ZodEffects (the refine above) has no `.partial()`.
 */
export const updateProjectSchema = z
  .object({
    name: name.optional(),
    description,
    status: z.enum(PROJECT_STATUSES).optional(),
    visibility: z.enum(PROJECT_VISIBILITIES).optional(),
    startDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
    ownerId: z.uuid().nullable().optional(),
    color: z.string().max(32).optional(),
    icon: z.string().max(32).optional(),
  })
  .partial();

export const listProjectsQuerySchema = z.object({
  spaceId: z.uuid().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  /** Include archived projects, which are hidden by default. */
  includeArchived: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
