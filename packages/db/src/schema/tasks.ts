import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdOnly, primaryId, timestamps } from '../columns.js';
import { user } from './auth.js';
import { customFieldKindEnum, dependencyTypeEnum, taskPriorityEnum } from './enums.js';
import { organizationId } from './org-column.js';
import { projects, taskStatuses } from './work.js';

export const sprints = pgTable(
  'sprints',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    goal: text('goal'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('sprints_project_idx').on(t.projectId, t.deletedAt),
    index('sprints_org_idx').on(t.organizationId),
  ],
);

export const milestones = pgTable(
  'milestones',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('milestones_project_idx').on(t.projectId, t.deletedAt),
    index('milestones_org_idx').on(t.organizationId),
  ],
);

/**
 * The central table.
 *
 * `parentTaskId` is a real self-reference giving unlimited nesting - the legacy
 * app had a flat embedded array and could not represent a subtask of a subtask.
 * `position` is a fractional index, so dragging a card writes one row instead
 * of renumbering the column.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, {
      onDelete: 'cascade',
    }),
    /** Per-project sequence behind the display key, e.g. 123 in ACME-123. */
    number: integer('number').notNull(),
    title: text('title').notNull(),
    /** Tiptap document. */
    description: jsonb('description'),
    /** Plain-text mirror of `description`, for BM25 search and embeddings. */
    descriptionText: text('description_text'),
    statusId: uuid('status_id').references(() => taskStatuses.id, { onDelete: 'set null' }),
    priority: taskPriorityEnum('priority').notNull().default('none'),
    reporterId: uuid('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    estimateMinutes: integer('estimate_minutes'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    position: text('position').notNull(),
    /** Recurrence rule (P1); null for a one-off task. */
    recurrenceRule: text('recurrence_rule'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tasks_project_number_uq').on(t.projectId, t.number),
    // The board and list views read by project + status, newest first.
    index('tasks_org_project_idx').on(t.organizationId, t.projectId, t.deletedAt),
    index('tasks_status_idx').on(t.statusId, t.position),
    index('tasks_parent_idx').on(t.parentTaskId),
    // "My work", grouped by due date.
    index('tasks_org_due_idx').on(t.organizationId, t.dueDate),
    index('tasks_sprint_idx').on(t.sprintId),
    index('tasks_milestone_idx').on(t.milestoneId),
    index('tasks_reporter_idx').on(t.reporterId),
  ],
);

export const taskAssignees = pgTable(
  'task_assignees',
  {
    id: primaryId(),
    organizationId: organizationId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('task_assignees_uq').on(t.taskId, t.userId),
    // Drives "everything assigned to me" and the workload view.
    index('task_assignees_org_user_idx').on(t.organizationId, t.userId),
  ],
);

export const taskWatchers = pgTable(
  'task_watchers',
  {
    id: primaryId(),
    organizationId: organizationId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('task_watchers_uq').on(t.taskId, t.userId),
    index('task_watchers_user_idx').on(t.userId),
    index('task_watchers_org_idx').on(t.organizationId),
  ],
);

/**
 * `taskId` blocks / is blocked by / relates to `dependsOnTaskId`.
 * Cycle detection happens in the service before insert - Postgres will not
 * catch it for us.
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: primaryId(),
    organizationId: organizationId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: dependencyTypeEnum('type').notNull().default('blocks'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('task_dependencies_uq').on(t.taskId, t.dependsOnTaskId, t.type),
    index('task_dependencies_depends_idx').on(t.dependsOnTaskId),
    index('task_dependencies_org_idx').on(t.organizationId),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: primaryId(),
    organizationId: organizationId(),
    /** Null means the label is available across the whole organization. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    ...timestamps,
  },
  (t) => [
    index('labels_org_idx').on(t.organizationId, t.deletedAt),
    index('labels_project_idx').on(t.projectId),
  ],
);

export const taskLabels = pgTable(
  'task_labels',
  {
    id: primaryId(),
    organizationId: organizationId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('task_labels_uq').on(t.taskId, t.labelId),
    index('task_labels_label_idx').on(t.labelId),
    index('task_labels_org_idx').on(t.organizationId),
  ],
);

export const checklists = pgTable(
  'checklists',
  {
    id: primaryId(),
    organizationId: organizationId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('checklists_task_idx').on(t.taskId, t.deletedAt),
    index('checklists_org_idx').on(t.organizationId),
  ],
);

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: primaryId(),
    organizationId: organizationId(),
    checklistId: uuid('checklist_id')
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('checklist_items_checklist_idx').on(t.checklistId, t.deletedAt),
    index('checklist_items_org_idx').on(t.organizationId),
  ],
);

export const customFields = pgTable(
  'custom_fields',
  {
    id: primaryId(),
    organizationId: organizationId(),
    /** Null means the field applies org-wide rather than to one project. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: customFieldKindEnum('kind').notNull(),
    /** Options for select/multi-select, or the expression for a formula. */
    config: jsonb('config'),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('custom_fields_org_idx').on(t.organizationId, t.deletedAt),
    index('custom_fields_project_idx').on(t.projectId),
  ],
);

export const customFieldValues = pgTable(
  'custom_field_values',
  {
    id: primaryId(),
    organizationId: organizationId(),
    customFieldId: uuid('custom_field_id')
      .notNull()
      .references(() => customFields.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** Shape depends on the field's `kind`; validated by the service. */
    value: jsonb('value'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('custom_field_values_uq').on(t.customFieldId, t.taskId),
    index('custom_field_values_task_idx').on(t.taskId),
    index('custom_field_values_org_idx').on(t.organizationId),
  ],
);

/** Reusable project or task shapes, stored as a payload the service replays. */
export const templates = pgTable(
  'templates',
  {
    id: primaryId(),
    organizationId: organizationId(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    payload: jsonb('payload').notNull(),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('templates_org_kind_idx').on(t.organizationId, t.kind, t.deletedAt),
    index('templates_creator_idx').on(t.createdById),
  ],
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'subtasks',
  }),
  subtasks: many(tasks, { relationName: 'subtasks' }),
  status: one(taskStatuses, { fields: [tasks.statusId], references: [taskStatuses.id] }),
  reporter: one(user, { fields: [tasks.reporterId], references: [user.id] }),
  sprint: one(sprints, { fields: [tasks.sprintId], references: [sprints.id] }),
  milestone: one(milestones, { fields: [tasks.milestoneId], references: [milestones.id] }),
  assignees: many(taskAssignees),
  watchers: many(taskWatchers),
  labels: many(taskLabels),
  checklists: many(checklists),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(user, { fields: [taskAssignees.userId], references: [user.id] }),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

export const checklistsRelations = relations(checklists, ({ one, many }) => ({
  task: one(tasks, { fields: [checklists.taskId], references: [tasks.id] }),
  items: many(checklistItems),
}));
