/**
 * Domain enums shared by both apps. The database mirrors these as pg enums and
 * the UI renders from them, so this file is the single source of truth for the
 * allowed values of each.
 */

export const ORG_ROLES = ['owner', 'admin', 'manager', 'member', 'guest'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PROJECT_STATUSES = ['planning', 'active', 'on-hold', 'done', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_VISIBILITIES = ['org', 'team', 'private', 'guest'] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DEPENDENCY_TYPES = ['blocks', 'blocked-by', 'relates-to'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const DEAL_STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const PLAN_TIERS = ['free', 'pro', 'business', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const DIGEST_CADENCES = ['instant', 'hourly', 'daily', 'off'] as const;
export type DigestCadence = (typeof DIGEST_CADENCES)[number];
