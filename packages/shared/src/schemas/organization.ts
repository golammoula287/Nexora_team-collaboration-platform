import { z } from 'zod';
import { ORG_ROLES } from '../enums';

/**
 * Request schemas shared by the API's validator and the frontend's forms.
 * Defined once so the two cannot drift (decision #19).
 */

export const orgSlugSchema = z
  .string()
  .min(2, 'At least 2 characters.')
  .max(48, 'At most 48 characters.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case letters, numbers and hyphens only.')
  // Reserved because they are real routes; an org here would shadow them.
  .refine(
    (value) =>
      ![
        'sign-in',
        'sign-up',
        'reset-password',
        'accept-invite',
        'two-factor',
        'account',
        'new-organization',
        'pricing',
        'changelog',
        'api',
        'admin',
      ].includes(value),
    'That name is reserved.',
  );

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'At least 2 characters.').max(100),
  slug: orgSlugSchema,
});

export const inviteMemberSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.enum(ORG_ROLES),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLES),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
