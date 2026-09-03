import { relations } from 'drizzle-orm';
import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdOnly, primaryId, timestamps } from '../columns.js';
import { organization, user } from './auth.js';
import {
  orgRoleEnum,
  projectStatusEnum,
  projectVisibilityEnum,
  statusCategoryEnum,
} from './enums.js';
import { organizationId } from './org-column.js';

/**
 * The hierarchy the whole product hangs off:
 *
 *   Organization -> Space -> Project -> Task
 *
 * A Space is a department or a client. The legacy app had no level above
 * Project and no tenant at all, which is why this rebuild exists.
 */

export const spaces = pgTable(
  'spaces',
  {
    id: primaryId(),
    organizationId: organizationId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color'),
    /** Fractional index - reordering writes one row, never the whole list. */
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('spaces_org_slug_uq').on(t.organizationId, t.slug),
    index('spaces_org_idx').on(t.organizationId, t.deletedAt),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    organizationId: organizationId(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Short prefix for human-readable task ids, e.g. ACME in ACME-123. */
    key: text('key').notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('planning'),
    visibility: projectVisibilityEnum('visibility').notNull().default('org'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),
    color: text('color'),
    icon: text('icon'),
    /** Counter behind the task key; incremented inside the create transaction. */
    taskCounter: integer('task_counter').notNull().default(0),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('projects_org_key_uq').on(t.organizationId, t.key),
    index('projects_org_status_idx').on(t.organizationId, t.status, t.deletedAt),
    index('projects_space_idx').on(t.spaceId, t.deletedAt),
    index('projects_owner_idx').on(t.ownerId),
  ],
);

/**
 * Project-level role override: someone can be a `member` of the organization
 * but a `manager` on one project. `can()` resolves the override first, then
 * falls back to the org role.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('project_members_uq').on(t.projectId, t.userId),
    index('project_members_user_idx').on(t.userId),
    index('project_members_org_idx').on(t.organizationId),
  ],
);

/**
 * Board columns. Custom per project, but each maps to a fixed category so
 * "is this task done?" is answerable without reading the column's name.
 */
export const taskStatuses = pgTable(
  'task_statuses',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: statusCategoryEnum('category').notNull().default('todo'),
    color: text('color'),
    /** WIP limit (P1); null means unlimited. */
    wipLimit: integer('wip_limit'),
    position: text('position').notNull(),
    ...createdOnly,
  },
  (t) => [
    index('task_statuses_project_idx').on(t.projectId),
    index('task_statuses_org_idx').on(t.organizationId),
  ],
);

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  organization: one(organization, {
    fields: [spaces.organizationId],
    references: [organization.id],
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organization, {
    fields: [projects.organizationId],
    references: [organization.id],
  }),
  space: one(spaces, { fields: [projects.spaceId], references: [spaces.id] }),
  owner: one(user, { fields: [projects.ownerId], references: [user.id] }),
  members: many(projectMembers),
  statuses: many(taskStatuses),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(user, { fields: [projectMembers.userId], references: [user.id] }),
}));
