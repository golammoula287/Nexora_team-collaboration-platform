import { uuid } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * The tenant key. Every domain table has exactly this column, and every query
 * filters on it through `withOrg()`. Cascading on delete means removing an
 * organization removes its data rather than orphaning it.
 */
export const organizationId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
