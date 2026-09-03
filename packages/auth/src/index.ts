export { createAuth, AUTH_ORG_ROLES } from './auth.js';
export type { Auth, AuthConfig, AuthEmail, AuthSession } from './auth.js';

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
} from './permissions.js';
export type { ActionFor, Resource } from './permissions.js';
