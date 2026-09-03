/**
 * The permission matrix now lives in `@nexora/shared` so the browser can use
 * the same definition the API enforces - see decision #47.
 *
 * Re-exported from here because every backend import already points at this
 * path, and because `packages/auth` is the natural place to look for it.
 */
export {
  ac,
  can,
  canInProject,
  canManageRole,
  roles,
  statement,
  owner,
  admin,
  manager,
  member,
  guest,
} from '@nexora/shared';
export type { ActionFor, Resource } from '@nexora/shared';
