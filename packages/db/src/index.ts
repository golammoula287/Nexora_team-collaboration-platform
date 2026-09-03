export * as schema from './schema/index.js';
export * from './schema/index.js';

export { createDatabase, createReadOnlyDatabase } from './client.js';
export type { AnyDatabase, Database, Schema, Transaction } from './client.js';

export { withOrg, softDeletePatch } from './tenancy.js';
export type { OrgScope, OrgTable, SoftDeletableOrgTable } from './tenancy.js';

export { newId, isUuid } from './ids.js';
export { EMBEDDING_DIMENSIONS } from './schema/ai.js';
