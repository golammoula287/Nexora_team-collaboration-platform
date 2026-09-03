import { createAccessControl } from 'better-auth/plugins/access';
import type { OrgRole } from '@nexora/shared';

/**
 * THE PERMISSION MATRIX.
 *
 * One definition, used by three callers:
 *   - the API's `authorize` middleware, which is the real gate
 *   - the Better Auth organization plugin, for its own membership checks
 *   - the UI, to hide buttons - which is cosmetic and never a guarantee
 *
 * The legacy app had role checks scattered across controllers and a
 * `// @access Protected` comment that was simply false on three routers. This
 * file exists so there is exactly one answer to "who can do what", and so that
 * answer is testable in isolation.
 */

/** Resource -> the actions that can be taken on it. */
export const statement = {
  organization: ['read', 'update', 'delete', 'billing'],
  member: ['read', 'invite', 'remove', 'set-role'],
  team: ['read', 'create', 'update', 'delete'],
  space: ['read', 'create', 'update', 'delete'],
  project: ['read', 'create', 'update', 'delete', 'archive'],
  task: ['read', 'create', 'update', 'delete', 'assign'],
  document: ['read', 'create', 'update', 'delete', 'publish'],
  comment: ['read', 'create', 'update', 'delete'],
  file: ['read', 'create', 'delete'],
  channel: ['read', 'create', 'update', 'delete'],
  timeEntry: ['read', 'create', 'update', 'delete', 'approve'],
  crm: ['read', 'create', 'update', 'delete'],
  finance: ['read', 'create', 'update', 'delete'],
  goal: ['read', 'create', 'update', 'delete'],
  automation: ['read', 'create', 'update', 'delete'],
  report: ['read', 'create'],
  integration: ['read', 'manage'],
  auditLog: ['read'],
  ai: ['use', 'configure'],
} as const;

export const ac = createAccessControl(statement);

/**
 * owner - the person who owns the account. Only they can delete the
 * organization or touch billing.
 */
export const owner = ac.newRole({
  organization: ['read', 'update', 'delete', 'billing'],
  member: ['read', 'invite', 'remove', 'set-role'],
  team: ['read', 'create', 'update', 'delete'],
  space: ['read', 'create', 'update', 'delete'],
  project: ['read', 'create', 'update', 'delete', 'archive'],
  task: ['read', 'create', 'update', 'delete', 'assign'],
  document: ['read', 'create', 'update', 'delete', 'publish'],
  comment: ['read', 'create', 'update', 'delete'],
  file: ['read', 'create', 'delete'],
  channel: ['read', 'create', 'update', 'delete'],
  timeEntry: ['read', 'create', 'update', 'delete', 'approve'],
  crm: ['read', 'create', 'update', 'delete'],
  finance: ['read', 'create', 'update', 'delete'],
  goal: ['read', 'create', 'update', 'delete'],
  automation: ['read', 'create', 'update', 'delete'],
  report: ['read', 'create'],
  integration: ['read', 'manage'],
  auditLog: ['read'],
  ai: ['use', 'configure'],
});

/** admin - runs the workspace day to day, but cannot delete it or see billing. */
export const admin = ac.newRole({
  organization: ['read', 'update'],
  member: ['read', 'invite', 'remove', 'set-role'],
  team: ['read', 'create', 'update', 'delete'],
  space: ['read', 'create', 'update', 'delete'],
  project: ['read', 'create', 'update', 'delete', 'archive'],
  task: ['read', 'create', 'update', 'delete', 'assign'],
  document: ['read', 'create', 'update', 'delete', 'publish'],
  comment: ['read', 'create', 'update', 'delete'],
  file: ['read', 'create', 'delete'],
  channel: ['read', 'create', 'update', 'delete'],
  timeEntry: ['read', 'create', 'update', 'delete', 'approve'],
  crm: ['read', 'create', 'update', 'delete'],
  finance: ['read', 'create', 'update', 'delete'],
  goal: ['read', 'create', 'update', 'delete'],
  automation: ['read', 'create', 'update', 'delete'],
  report: ['read', 'create'],
  integration: ['read', 'manage'],
  auditLog: ['read'],
  ai: ['use', 'configure'],
});

/**
 * manager - owns delivery. Can shape projects and approve timesheets, and can
 * read the money, but cannot change billing, remove members or reshape the org.
 */
export const manager = ac.newRole({
  organization: ['read'],
  member: ['read', 'invite'],
  team: ['read'],
  space: ['read', 'create', 'update'],
  project: ['read', 'create', 'update', 'archive'],
  task: ['read', 'create', 'update', 'delete', 'assign'],
  document: ['read', 'create', 'update', 'delete', 'publish'],
  comment: ['read', 'create', 'update', 'delete'],
  file: ['read', 'create', 'delete'],
  channel: ['read', 'create', 'update'],
  timeEntry: ['read', 'create', 'update', 'approve'],
  crm: ['read', 'create', 'update'],
  finance: ['read'],
  goal: ['read', 'create', 'update'],
  automation: ['read', 'create', 'update'],
  report: ['read', 'create'],
  integration: ['read'],
  auditLog: [],
  ai: ['use'],
});

/**
 * member - does the work. Full authorship over tasks, docs and comments;
 * no access to money, members or automations beyond reading.
 */
export const member = ac.newRole({
  organization: ['read'],
  member: ['read'],
  team: ['read'],
  space: ['read'],
  project: ['read'],
  task: ['read', 'create', 'update', 'assign'],
  document: ['read', 'create', 'update'],
  comment: ['read', 'create', 'update', 'delete'],
  file: ['read', 'create'],
  channel: ['read', 'create'],
  timeEntry: ['read', 'create', 'update'],
  crm: [],
  finance: [],
  goal: ['read'],
  automation: ['read'],
  report: ['read'],
  integration: [],
  auditLog: [],
  ai: ['use'],
});

/**
 * guest - an external client. Sees only what has been shared with them, and
 * can talk about it. Never sees costs, margins, internal tasks or people.
 *
 * Note there is no `task` or `project` create/update here at all: the client
 * portal is read-plus-comment by design.
 */
export const guest = ac.newRole({
  organization: [],
  member: [],
  team: [],
  space: [],
  project: ['read'],
  task: ['read'],
  document: ['read'],
  comment: ['read', 'create'],
  file: ['read'],
  channel: ['read'],
  timeEntry: [],
  crm: [],
  finance: [],
  goal: [],
  automation: [],
  report: [],
  integration: [],
  auditLog: [],
  ai: [],
});

export const roles = { owner, admin, manager, member, guest } as const;

export type Resource = keyof typeof statement;
export type ActionFor<R extends Resource> = (typeof statement)[R][number];

/**
 * The single authorization question.
 *
 *   can('manager', 'approve', 'timeEntry')  -> true
 *   can('member', 'delete', 'project')      -> false
 *
 * Unknown roles return false rather than throwing: an unrecognised role must
 * never be more permissive than a known one, and a 403 is a better failure
 * than a 500.
 */
export function can<R extends Resource>(
  role: OrgRole | string | null | undefined,
  action: ActionFor<R>,
  resource: R,
): boolean {
  // `Object.hasOwn`, never `role in roles`: `in` walks the prototype chain, so
  // a caller-supplied role of "toString" or "constructor" would pass the guard
  // and then blow up on `.statements`. Turning an attacker-chosen string into a
  // 500 inside the authorization path is not an acceptable failure mode.
  if (!role || !Object.hasOwn(roles, role)) return false;

  const definition = roles[role as OrgRole]?.statements as
    Record<string, readonly string[]> | undefined;

  return definition?.[resource]?.includes(action) ?? false;
}

/**
 * Project-level override: someone can be a `member` of the organization but a
 * `manager` on one project. The more permissive of the two wins, so an override
 * can only ever grant - never silently remove access the org role already gave.
 */
export function canInProject<R extends Resource>(
  orgRole: OrgRole | string | null | undefined,
  projectRole: OrgRole | string | null | undefined,
  action: ActionFor<R>,
  resource: R,
): boolean {
  return can(orgRole, action, resource) || can(projectRole, action, resource);
}

/** Ranking used for "can this role act on that role" checks. */
const RANK: Record<OrgRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  guest: 1,
};

/**
 * Whether `actor` may change `target`'s role.
 *
 * Strictly greater, not greater-or-equal: an admin cannot demote another admin,
 * and no one can act on an owner except an owner. This is the check that stops
 * privilege escalation between peers.
 */
export function canManageRole(actor: OrgRole, target: OrgRole, nextRole: OrgRole): boolean {
  if (!can(actor, 'set-role', 'member')) return false;
  return RANK[actor] > RANK[target] && RANK[actor] >= RANK[nextRole];
}
