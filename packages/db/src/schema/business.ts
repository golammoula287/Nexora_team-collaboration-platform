import { relations } from 'drizzle-orm';
import {
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
import { user } from './auth.js';
import { dealStageEnum, invoiceStatusEnum } from './enums.js';
import { organizationId } from './org-column.js';
import { projects } from './work.js';

/**
 * CRM and finance. These tables ship in phase 1 even though their UI lands in
 * phase 7 - the whole point is that phase 7 adds routes and screens, never a
 * migration (decision #12).
 *
 * Money is `numeric`, never a float. Amounts are stored in the currency named
 * on the row; there is no implicit base currency.
 */

export const companies = pgTable(
  'companies',
  {
    id: primaryId(),
    organizationId: organizationId(),
    name: text('name').notNull(),
    domain: text('domain'),
    industry: text('industry'),
    website: text('website'),
    phone: text('phone'),
    address: jsonb('address'),
    notes: text('notes'),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),
    tags: text('tags').array(),
    ...timestamps,
  },
  (t) => [
    index('companies_org_idx').on(t.organizationId, t.deletedAt),
    index('companies_owner_idx').on(t.ownerId),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: primaryId(),
    organizationId: organizationId(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    jobTitle: text('job_title'),
    source: text('source'),
    notes: text('notes'),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),
    tags: text('tags').array(),
    /** Set when the contact has a guest login into the client portal. */
    portalUserId: uuid('portal_user_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('contacts_org_idx').on(t.organizationId, t.deletedAt),
    index('contacts_company_idx').on(t.companyId),
    index('contacts_email_idx').on(t.organizationId, t.email),
    index('contacts_owner_idx').on(t.ownerId),
    index('contacts_portal_user_idx').on(t.portalUserId),
  ],
);

/**
 * The pipeline. The legacy model had no stage column at all, which is why its
 * "prospects" could not be reported on.
 */
export const deals = pgTable(
  'deals',
  {
    id: primaryId(),
    organizationId: organizationId(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    stage: dealStageEnum('stage').notNull().default('lead'),
    value: numeric('value', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    /** 0-100; weighted forecast is value * probability. */
    probability: integer('probability'),
    expectedCloseDate: date('expected_close_date'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    lossReason: text('loss_reason'),
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),
    /** Set when the deal is converted; the conversion is one transaction. */
    convertedProjectId: uuid('converted_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    position: text('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('deals_org_stage_idx').on(t.organizationId, t.stage, t.deletedAt),
    index('deals_company_idx').on(t.companyId),
    index('deals_owner_idx').on(t.ownerId),
    index('deals_close_date_idx').on(t.organizationId, t.expectedCloseDate),
    index('deals_contact_idx').on(t.contactId),
    index('deals_converted_project_idx').on(t.convertedProjectId),
  ],
);

/**
 * Replaces the legacy embedded `costSchema`, which could not be queried,
 * indexed or audited.
 */
export const projectCosts = pgTable(
  'project_costs',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    vendor: text('vendor'),
    description: text('description'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    incurredOn: date('incurred_on').notNull(),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('project_costs_project_idx').on(t.projectId, t.deletedAt),
    index('project_costs_org_date_idx').on(t.organizationId, t.incurredOn),
    index('project_costs_creator_idx').on(t.createdById),
  ],
);

/**
 * Project economics. `rate` is what the client is billed; profit is
 * `rate - sum(project_costs.amount)`, computed at read time rather than stored,
 * so it can never drift from the cost rows.
 */
export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: primaryId(),
    organizationId: organizationId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    rate: numeric('rate', { precision: 14, scale: 2 }),
    budget: numeric('budget', { precision: 14, scale: 2 }),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_budgets_project_uq').on(t.projectId),
    index('project_budgets_org_idx').on(t.organizationId),
    index('project_budgets_company_idx').on(t.companyId),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: primaryId(),
    organizationId: organizationId(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** Human-facing number, unique per organization. */
    number: text('number').notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    currency: text('currency').notNull().default('USD'),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    taxRate: numeric('tax_rate', { precision: 6, scale: 3 }),
    total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
    amountPaid: numeric('amount_paid', { precision: 14, scale: 2 }).notNull().default('0'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invoices_org_number_uq').on(t.organizationId, t.number),
    index('invoices_org_status_idx').on(t.organizationId, t.status, t.deletedAt),
    index('invoices_company_idx').on(t.companyId),
    index('invoices_project_idx').on(t.projectId),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: primaryId(),
    organizationId: organizationId(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    position: text('position').notNull(),
    ...createdOnly,
  },
  (t) => [
    index('invoice_lines_invoice_idx').on(t.invoiceId),
    index('invoice_lines_org_idx').on(t.organizationId),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: primaryId(),
    organizationId: organizationId(),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    spentOn: date('spent_on').notNull(),
    /** draft | submitted | approved | rejected | reimbursed */
    status: text('status').notNull().default('draft'),
    approvedById: uuid('approved_by_id').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('expenses_org_status_idx').on(t.organizationId, t.status, t.deletedAt),
    index('expenses_user_idx').on(t.userId, t.spentOn),
    index('expenses_project_idx').on(t.projectId),
    index('expenses_approver_idx').on(t.approvedById),
  ],
);

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  deals: many(deals),
  invoices: many(invoices),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  company: one(companies, { fields: [deals.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
  convertedProject: one(projects, {
    fields: [deals.convertedProjectId],
    references: [projects.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  lines: many(invoiceLines),
}));
