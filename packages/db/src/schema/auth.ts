import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from '../columns.js';
import { orgRoleEnum } from './enums.js';

/**
 * BETTER AUTH OWNED TABLES.
 *
 * Shape follows Better Auth 1.7 core plus the organization+teams, admin,
 * twoFactor, passkey, apiKey, sso and stripe plugins. Columns marked "extra"
 * are Nexora additions declared to Better Auth as `additionalFields`.
 *
 * Do not hand-edit the Better Auth columns to fix a type error. In phase 2,
 * run `npx @better-auth/cli generate` against the real auth config and
 * reconcile this file against its output - the library is the authority on its
 * own schema, and a drift here surfaces as a runtime failure at sign-in.
 *
 * IDs are uuid, not Better Auth's default text. Phase 2 must configure
 * `advanced.database.generateId: () => uuidv7()` to match.
 */

export const user = pgTable(
  'user',
  {
    id: primaryId(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),

    // admin plugin
    role: text('role'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true, mode: 'date' }),

    // twoFactor plugin
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),

    // extra: profile (M1)
    jobTitle: text('job_title'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    /** `{ mon: ['09:00','17:00'], ... }` - feeds capacity in phase 7. */
    workingHours: jsonb('working_hours'),
    /** Checked on every request; a deactivated user is refused immediately. */
    isActive: boolean('is_active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('user_email_uq').on(t.email)],
);

export const session = pgTable(
  'session',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // organization plugin - which org and team this session is acting in
    activeOrganizationId: uuid('active_organization_id'),
    activeTeamId: uuid('active_team_id'),
    // admin plugin
    impersonatedBy: uuid('impersonated_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('session_token_uq').on(t.token),
    index('session_user_idx').on(t.userId),
    index('session_expires_idx').on(t.expiresAt),
  ],
);

export const account = pgTable(
  'account',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    /** Required by Better Auth 1.7; the OAuth issuer, or the provider id for credentials. */
    issuer: text('issuer').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    /** scrypt hash for the credential provider; null for OAuth accounts. */
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    uniqueIndex('account_provider_uq').on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: primaryId(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const twoFactor = pgTable(
  'two_factor',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').notNull().default(false),
    /** Lockout counters, so a TOTP prompt cannot be brute-forced. */
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('two_factor_user_idx').on(t.userId)],
);

export const passkey = pgTable(
  'passkey',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: createdAt(),
  },
  (t) => [
    index('passkey_user_idx').on(t.userId),
    uniqueIndex('passkey_credential_uq').on(t.credentialID),
  ],
);

// ---------------------------------------------------------------------------
// Organization plugin - the tenant boundary everything else hangs off
// ---------------------------------------------------------------------------

export const organization = pgTable(
  'organization',
  {
    id: primaryId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    metadata: jsonb('metadata'),

    // extra: domain auto-join (M1)
    autoJoinDomain: text('auto_join_domain'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('organization_slug_uq').on(t.slug)],
);

export const member = pgTable(
  'member',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('member_org_user_uq').on(t.organizationId, t.userId),
    index('member_user_idx').on(t.userId),
    index('member_org_role_idx').on(t.organizationId, t.role),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull().default('member'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('invitation_org_idx').on(t.organizationId),
    index('invitation_email_idx').on(t.email),
    index('invitation_inviter_idx').on(t.inviterId),
  ],
);

export const team = pgTable(
  'team',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Denormalised by Better Auth so team lists do not need a count query. */
    memberCount: integer('member_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('team_org_idx').on(t.organizationId)],
);

export const teamMember = pgTable(
  'team_member',
  {
    id: primaryId(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    membershipKey: text('membership_key'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('team_member_uq').on(t.teamId, t.userId),
    index('team_member_user_idx').on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// apiKey / sso / stripe plugins - tables ship now, wired up in phases 8 and 9
// ---------------------------------------------------------------------------

export const apikey = pgTable(
  'apikey',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    name: text('name'),
    start: text('start'),
    prefix: text('prefix'),
    key: text('key').notNull(),
    /** Required by the 1.7 apiKey plugin: which key config, and what it acts for. */
    configId: text('config_id').notNull(),
    referenceId: text('reference_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true, mode: 'date' }),
    rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count').notNull().default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    permissions: text('permissions'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('apikey_user_idx').on(t.userId), index('apikey_org_idx').on(t.organizationId)],
);

export const ssoProvider = pgTable(
  'sso_provider',
  {
    id: primaryId(),
    issuer: text('issuer').notNull(),
    domain: text('domain').notNull(),
    providerId: text('provider_id').notNull(),
    oidcConfig: text('oidc_config'),
    samlConfig: text('saml_config'),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sso_provider_id_uq').on(t.providerId),
    index('sso_provider_org_idx').on(t.organizationId),
    index('sso_provider_user_idx').on(t.userId),
  ],
);

export const subscription = pgTable(
  'subscription',
  {
    id: primaryId(),
    plan: text('plan').notNull(),
    /** The organization id, per Better Auth's stripe plugin reference model. */
    referenceId: uuid('reference_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').notNull().default('incomplete'),
    periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    seats: integer('seats'),
    trialStart: timestamp('trial_start', { withTimezone: true, mode: 'date' }),
    trialEnd: timestamp('trial_end', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscription_reference_idx').on(t.referenceId),
    index('subscription_stripe_idx').on(t.stripeSubscriptionId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(member),
  teamMemberships: many(teamMember),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  teams: many(team),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  members: many(teamMember),
}));
