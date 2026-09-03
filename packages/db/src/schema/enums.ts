import { pgEnum } from 'drizzle-orm/pg-core';
import {
  DEAL_STAGES,
  DEPENDENCY_TYPES,
  DIGEST_CADENCES,
  ORG_ROLES,
  PLAN_TIERS,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  TASK_PRIORITIES,
} from '@nexora/shared';

/**
 * Postgres enums mirror the value lists in `@nexora/shared`, so the database,
 * the API's Zod schemas and the UI's dropdowns cannot drift apart. Adding a
 * value means editing the shared list and generating a migration - which is
 * exactly the friction that should exist.
 */

export const orgRoleEnum = pgEnum('org_role', ORG_ROLES);
export const projectStatusEnum = pgEnum('project_status', PROJECT_STATUSES);
export const projectVisibilityEnum = pgEnum('project_visibility', PROJECT_VISIBILITIES);
export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);
export const dependencyTypeEnum = pgEnum('dependency_type', DEPENDENCY_TYPES);
export const dealStageEnum = pgEnum('deal_stage', DEAL_STAGES);
export const planTierEnum = pgEnum('plan_tier', PLAN_TIERS);
export const digestCadenceEnum = pgEnum('digest_cadence', DIGEST_CADENCES);

/** Statuses a task column can behave as, independent of its display name. */
export const statusCategoryEnum = pgEnum('status_category', [
  'todo',
  'in-progress',
  'done',
  'cancelled',
]);

/** Polymorphic parent for comments, attachments, reactions and activities. */
export const entityTypeEnum = pgEnum('entity_type', [
  'project',
  'task',
  'document',
  'message',
  'comment',
  'file',
  'contact',
  'company',
  'deal',
  'invoice',
  'goal',
  'space',
]);

export const attachmentStatusEnum = pgEnum('attachment_status', [
  'pending',
  'ready',
  'failed',
  'quarantined',
]);

export const channelKindEnum = pgEnum('channel_kind', ['project', 'space', 'dm', 'group']);

export const timesheetStatusEnum = pgEnum('timesheet_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'overdue',
  'void',
]);

export const goalStatusEnum = pgEnum('goal_status', [
  'on-track',
  'at-risk',
  'off-track',
  'done',
  'cancelled',
]);

export const keyResultKindEnum = pgEnum('key_result_kind', [
  'number',
  'percent',
  'currency',
  'milestone',
]);

export const automationRunStatusEnum = pgEnum('automation_run_status', [
  'success',
  'failed',
  'skipped',
]);

export const customFieldKindEnum = pgEnum('custom_field_kind', [
  'text',
  'number',
  'currency',
  'date',
  'select',
  'multi-select',
  'user',
  'checkbox',
  'url',
  'formula',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'mention',
  'assignment',
  'due-date',
  'status-change',
  'comment',
  'invitation',
  'digest',
  'system',
]);

export const aiRunKindEnum = pgEnum('ai_run_kind', [
  'chat',
  'embedding',
  'summary',
  'extraction',
  'classification',
  'rewrite',
]);
