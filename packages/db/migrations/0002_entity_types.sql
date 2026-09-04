-- Two entity types the audit log needed and did not have.
--
-- `activities.entity_type` had no value for an organization or for a member, so
-- organization-level rows had nowhere correct to go: member role changes were
-- being filed under 'space', which makes the audit log wrong in the one place
-- it must not be. Saved views that belong to the whole organization rather than
-- to a project need the same thing.
--
-- ADD VALUE is safe inside a transaction on PG12+ as long as the new value is
-- not used in that same transaction, which no migration here does.
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'organization';
--> statement-breakpoint
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'member';
