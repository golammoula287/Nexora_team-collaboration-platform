import { describe, expect, it } from 'vitest';
import { ORG_ROLES, type OrgRole } from '@nexora/shared';
import { can, canInProject, canManageRole, roles, statement } from '../src/permissions.js';

/**
 * The permission matrix is the one place that answers "who can do what", so it
 * is worth testing exhaustively rather than by example. These are pure - no
 * database, no network - which is exactly why the API can afford to call `can()`
 * on every request.
 */

describe('matrix shape', () => {
  it('defines every org role', () => {
    for (const role of ORG_ROLES) {
      expect(roles[role], `role ${role} is missing`).toBeDefined();
    }
  });

  it('gives every role an entry for every resource', () => {
    // A missing resource key would silently deny rather than fail loudly, which
    // is safe but confusing. Require them to be explicit.
    for (const role of ORG_ROLES) {
      const definition = roles[role].statements as Record<string, readonly string[]>;
      for (const resource of Object.keys(statement)) {
        expect(definition[resource], `${role} has no entry for ${resource}`).toBeDefined();
      }
    }
  });

  it('grants only actions the resource actually declares', () => {
    for (const role of ORG_ROLES) {
      const definition = roles[role].statements as Record<string, readonly string[]>;
      for (const [resource, actions] of Object.entries(definition)) {
        const declared = statement[resource as keyof typeof statement] as readonly string[];
        for (const action of actions) {
          expect(declared, `${role}.${resource} grants unknown action ${action}`).toContain(action);
        }
      }
    }
  });
});

describe('privilege ordering', () => {
  /**
   * Whatever a lower role can do, every higher role must also be able to do.
   * Without this, "promote to manager" could quietly take capabilities away.
   */
  const ladder: OrgRole[] = ['guest', 'member', 'manager', 'admin', 'owner'];

  it('is monotonic from guest up to owner', () => {
    for (let i = 0; i < ladder.length - 1; i += 1) {
      const lower = ladder[i] as OrgRole;
      const higher = ladder[i + 1] as OrgRole;
      const lowerDef = roles[lower].statements as Record<string, readonly string[]>;

      for (const [resource, actions] of Object.entries(lowerDef)) {
        for (const action of actions) {
          expect(
            can(higher, action as never, resource as never),
            `${higher} should inherit ${resource}.${action} from ${lower}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('the specific rules that matter', () => {
  it('lets only the owner delete the organization or touch billing', () => {
    expect(can('owner', 'delete', 'organization')).toBe(true);
    expect(can('owner', 'billing', 'organization')).toBe(true);

    for (const role of ['admin', 'manager', 'member', 'guest'] as const) {
      expect(can(role, 'delete', 'organization'), `${role} must not delete the org`).toBe(false);
      expect(can(role, 'billing', 'organization'), `${role} must not see billing`).toBe(false);
    }
  });

  it('keeps money away from members and guests', () => {
    expect(can('member', 'read', 'finance')).toBe(false);
    expect(can('guest', 'read', 'finance')).toBe(false);
    // A manager can see project economics but not change them.
    expect(can('manager', 'read', 'finance')).toBe(true);
    expect(can('manager', 'update', 'finance')).toBe(false);
    expect(can('admin', 'update', 'finance')).toBe(true);
  });

  it('makes the guest role read-plus-comment and nothing more', () => {
    expect(can('guest', 'read', 'project')).toBe(true);
    expect(can('guest', 'read', 'task')).toBe(true);
    expect(can('guest', 'create', 'comment')).toBe(true);

    expect(can('guest', 'create', 'task')).toBe(false);
    expect(can('guest', 'update', 'task')).toBe(false);
    expect(can('guest', 'delete', 'comment')).toBe(false);
    expect(can('guest', 'read', 'crm')).toBe(false);
    expect(can('guest', 'read', 'member')).toBe(false);
    expect(can('guest', 'use', 'ai')).toBe(false);
  });

  it('lets managers approve time but not members', () => {
    expect(can('manager', 'approve', 'timeEntry')).toBe(true);
    expect(can('member', 'approve', 'timeEntry')).toBe(false);
  });

  it('restricts the audit log to admins and owners', () => {
    expect(can('owner', 'read', 'auditLog')).toBe(true);
    expect(can('admin', 'read', 'auditLog')).toBe(true);
    expect(can('manager', 'read', 'auditLog')).toBe(false);
    expect(can('member', 'read', 'auditLog')).toBe(false);
  });
});

describe('unknown input', () => {
  it('denies rather than throwing', () => {
    // An unrecognised role must never be more permissive than a known one, and
    // a 403 is a better failure than a 500.
    expect(can('superuser', 'read', 'project')).toBe(false);
    expect(can(null, 'read', 'project')).toBe(false);
    expect(can(undefined, 'read', 'project')).toBe(false);
    expect(can('', 'read', 'project')).toBe(false);
  });

  it('is not fooled by a prototype-chain property name', () => {
    expect(can('constructor', 'read', 'project')).toBe(false);
    expect(can('toString', 'read', 'project')).toBe(false);
    expect(can('__proto__', 'read', 'project')).toBe(false);
  });
});

describe('project-level overrides', () => {
  it('grants when the project role is higher than the org role', () => {
    // "a member in the org but a manager on this project"
    expect(can('member', 'delete', 'task')).toBe(false);
    expect(canInProject('member', 'manager', 'delete', 'task')).toBe(true);
  });

  it('never removes access the org role already granted', () => {
    // An override can only add. Demoting someone on one project must not strip
    // a capability their org role gives them everywhere else.
    expect(canInProject('admin', 'guest', 'delete', 'task')).toBe(true);
  });

  it('is a no-op when there is no override', () => {
    expect(canInProject('member', null, 'create', 'task')).toBe(true);
    expect(canInProject('member', undefined, 'delete', 'project')).toBe(false);
  });
});

describe('role management', () => {
  it('lets an owner change anyone below them', () => {
    expect(canManageRole('owner', 'admin', 'manager')).toBe(true);
    expect(canManageRole('owner', 'member', 'admin')).toBe(true);
  });

  it('stops peers from demoting each other', () => {
    // The escalation path that matters: an admin must not be able to remove
    // another admin and take sole control.
    expect(canManageRole('admin', 'admin', 'member')).toBe(false);
    expect(canManageRole('manager', 'manager', 'member')).toBe(false);
  });

  it('stops anyone but an owner from touching an owner', () => {
    expect(canManageRole('admin', 'owner', 'member')).toBe(false);
    expect(canManageRole('manager', 'owner', 'member')).toBe(false);
  });

  it('stops a role granting more than it holds', () => {
    // An admin cannot mint an owner.
    expect(canManageRole('admin', 'member', 'owner')).toBe(false);
    expect(canManageRole('admin', 'member', 'admin')).toBe(true);
  });

  it('refuses roles that cannot set roles at all', () => {
    expect(canManageRole('member', 'guest', 'member')).toBe(false);
    expect(canManageRole('guest', 'guest', 'member')).toBe(false);
    // A manager can invite, but not change roles.
    expect(canManageRole('manager', 'member', 'admin')).toBe(false);
  });
});
