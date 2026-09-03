import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdOnly, primaryId, timestamps } from '../columns.js';
import { organization, user } from './auth.js';
import {
  automationRunStatusEnum,
  digestCadenceEnum,
  entityTypeEnum,
  goalStatusEnum,
  keyResultKindEnum,
  notificationKindEnum,
  timesheetStatusEnum,
} from './enums.js';
import { organizationId } from './org-column.js';
import { tasks } from './tasks.js';
import { projects } from './work.js';

export const timeEntries = pgTable(
  'time_entries',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    timesheetId: uuid('timesheet_id'),
    description: text('description'),
    /** The day the work is booked against, independent of the timestamps. */
    workDate: date('work_date').notNull(),
    minutes: integer('minutes').notNull(),
    isBillable: boolean('is_billable').notNull().default(true),
    /** Rate captured at entry time so later rate changes do not rewrite history. */
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('time_entries_org_user_date_idx').on(t.organizationId, t.userId, t.workDate),
    index('time_entries_project_idx').on(t.projectId, t.workDate),
    index('time_entries_task_idx').on(t.taskId),
    index('time_entries_timesheet_idx').on(t.timesheetId),
  ],
);

export const timesheets = pgTable(
  'timesheets',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: timesheetStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    reviewedById: uuid('reviewed_by_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('timesheets_user_period_uq').on(t.userId, t.periodStart),
    index('timesheets_org_status_idx').on(t.organizationId, t.status),
    index('timesheets_reviewer_idx').on(t.reviewedById),
  ],
);

/**
 * The audit log. Every mutation writes one row inside the same transaction as
 * the change, so "what happened" and "it happened" cannot disagree.
 *
 * Append-only: no update or delete path exists in application code.
 */
export const activities = pgTable(
  'activities',
  {
    id: primaryId(),
    organizationId: organizationId(),
    /** Null for a system or scheduled-job action. */
    actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
    /** Set when the write was made by the AI on a user's behalf. */
    onBehalfOfAi: boolean('on_behalf_of_ai').notNull().default(false),
    action: text('action').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    /** Changed fields only, as `{ field: { from, to } }`. */
    changes: jsonb('changes'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...createdOnly,
  },
  (t) => [
    index('activities_org_created_idx').on(t.organizationId, t.createdAt),
    index('activities_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('activities_actor_idx').on(t.actorId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: entityTypeEnum('entity_type'),
    entityId: uuid('entity_id'),
    /** Deep link into the app. */
    url: text('url'),
    actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true, mode: 'date' }),
    emailedAt: timestamp('emailed_at', { withTimezone: true, mode: 'date' }),
    ...createdOnly,
  },
  (t) => [
    // The unread badge query.
    index('notifications_user_unread_idx').on(t.userId, t.readAt, t.createdAt),
    index('notifications_org_idx').on(t.organizationId),
    index('notifications_actor_idx').on(t.actorId),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
    push: boolean('push').notNull().default(false),
    slack: boolean('slack').notNull().default(false),
    cadence: digestCadenceEnum('cadence').notNull().default('instant'),
    /** Local times, honoured against the user's timezone. */
    quietHoursStart: text('quiet_hours_start'),
    quietHoursEnd: text('quiet_hours_end'),
    ...timestamps,
  },
  (t) => [uniqueIndex('notification_preferences_uq').on(t.organizationId, t.userId, t.kind)],
);

export const savedViews = pgTable(
  'saved_views',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** board | list | calendar | timeline */
    layout: text('layout').notNull().default('board'),
    /** Filter tree, grouping, sort and visible columns. */
    config: jsonb('config').notNull(),
    isShared: boolean('is_shared').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    shareToken: text('share_token'),
    ...timestamps,
  },
  (t) => [
    index('saved_views_org_idx').on(t.organizationId, t.deletedAt),
    index('saved_views_project_idx').on(t.projectId),
    uniqueIndex('saved_views_share_token_uq').on(t.shareToken),
    index('saved_views_owner_idx').on(t.ownerId),
  ],
);

export const automations = pgTable(
  'automations',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    /** `{ trigger, conditions, actions }` - validated by a Zod schema. */
    definition: jsonb('definition').notNull(),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('automations_org_idx').on(t.organizationId, t.isEnabled, t.deletedAt),
    index('automations_project_idx').on(t.projectId),
    index('automations_creator_idx').on(t.createdById),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: primaryId(),
    organizationId: organizationId(),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    status: automationRunStatusEnum('status').notNull(),
    trigger: jsonb('trigger'),
    result: jsonb('result'),
    error: text('error'),
    durationMs: integer('duration_ms'),
    ...createdOnly,
  },
  (t) => [
    index('automation_runs_automation_idx').on(t.automationId, t.createdAt),
    index('automation_runs_org_idx').on(t.organizationId),
  ],
);

export const forms = pgTable(
  'forms',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    /** Field definitions, conditional logic and the task field mapping. */
    definition: jsonb('definition').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('forms_org_slug_uq').on(t.organizationId, t.slug),
    index('forms_project_idx').on(t.projectId),
  ],
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: primaryId(),
    organizationId: organizationId(),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    /** Null for an anonymous public submission. */
    submittedById: uuid('submitted_by_id').references(() => user.id, { onDelete: 'set null' }),
    data: jsonb('data').notNull(),
    createdTaskId: uuid('created_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ...createdOnly,
  },
  (t) => [
    index('form_submissions_form_idx').on(t.formId, t.createdAt),
    index('form_submissions_org_idx').on(t.organizationId),
    index('form_submissions_submitter_idx').on(t.submittedById),
    index('form_submissions_task_idx').on(t.createdTaskId),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: primaryId(),
    organizationId: organizationId(),
    parentGoalId: uuid('parent_goal_id'),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),
    teamId: uuid('team_id'),
    status: goalStatusEnum('status').notNull().default('on-track'),
    /** 0-100, set at check-in. */
    confidence: integer('confidence'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    ...timestamps,
  },
  (t) => [
    index('goals_org_idx').on(t.organizationId, t.deletedAt),
    index('goals_owner_idx').on(t.ownerId),
    index('goals_parent_idx').on(t.parentGoalId),
  ],
);

export const keyResults = pgTable(
  'key_results',
  {
    id: primaryId(),
    organizationId: organizationId(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: keyResultKindEnum('kind').notNull().default('number'),
    startValue: numeric('start_value', { precision: 18, scale: 4 }),
    targetValue: numeric('target_value', { precision: 18, scale: 4 }),
    currentValue: numeric('current_value', { precision: 18, scale: 4 }),
    unit: text('unit'),
    /** Progress rolls up automatically when linked to work. */
    linkedProjectId: uuid('linked_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    linkedTaskId: uuid('linked_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('key_results_goal_idx').on(t.goalId, t.deletedAt),
    index('key_results_org_idx').on(t.organizationId),
    index('key_results_project_idx').on(t.linkedProjectId),
    index('key_results_task_idx').on(t.linkedTaskId),
  ],
);

export const activitiesRelations = relations(activities, ({ one }) => ({
  organization: one(organization, {
    fields: [activities.organizationId],
    references: [organization.id],
  }),
  actor: one(user, { fields: [activities.actorId], references: [user.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(user, { fields: [timeEntries.userId], references: [user.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));

export const goalsRelations = relations(goals, ({ many }) => ({
  keyResults: many(keyResults),
}));
