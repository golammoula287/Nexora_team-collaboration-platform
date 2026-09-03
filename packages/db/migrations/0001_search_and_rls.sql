-- ===========================================================================
--  Search indexes and row-level security.
--
--  Hand-written because drizzle-kit does not emit pgvector operator classes
--  for a custom column type, and does not model RLS policies at all.
--
--  RLS here is DEFENCE IN DEPTH, not the primary guard. The primary guard is
--  `withOrg()` in src/tenancy.ts, which puts the organization predicate in
--  every query. These policies catch the case where that is bypassed.
--
--  IMPORTANT: a table's owner bypasses RLS unless FORCE ROW LEVEL SECURITY is
--  set. In production the API must connect as a dedicated non-owner role for
--  these policies to have any effect - see the parking lot in
--  docs/WORK-SECTIONS.md. tests/rls.test.ts proves the policies are correct by
--  running as exactly such a role.
-- ===========================================================================

-- --- Vector and full-text indexes on the embeddings table ------------------

CREATE INDEX IF NOT EXISTS "embeddings_hnsw_idx"
  ON "embeddings" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "embeddings_search_vector_idx"
  ON "embeddings" USING gin ("search_vector");--> statement-breakpoint

-- --- Trigram indexes for fuzzy command-palette search ----------------------

CREATE INDEX IF NOT EXISTS "tasks_title_trgm_idx"
  ON "tasks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx"
  ON "projects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx"
  ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_name_trgm_idx"
  ON "contacts" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint

-- --- Row-level security: one policy per tenant table -----------------------
--
-- `nullif(..., '')` is load-bearing. Once a custom GUC has been set in a
-- session, a later `current_setting(..., true)` returns an EMPTY STRING rather
-- than NULL, and `''::uuid` raises rather than evaluating to false. Without the
-- nullif, an unscoped query would error instead of cleanly returning no rows.
-- Proven by "denies everything when app.org_id is unset" in tests/rls.test.ts.
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activities_tenant_isolation" ON "activities" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_conversations_tenant_isolation" ON "ai_conversations" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_credits_tenant_isolation" ON "ai_credits" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_messages_tenant_isolation" ON "ai_messages" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_runs_tenant_isolation" ON "ai_runs" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attachments_tenant_isolation" ON "attachments" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_runs_tenant_isolation" ON "automation_runs" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automations_tenant_isolation" ON "automations" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "channel_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channel_members_tenant_isolation" ON "channel_members" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channels_tenant_isolation" ON "channels" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "checklist_items_tenant_isolation" ON "checklist_items" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "checklists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "checklists_tenant_isolation" ON "checklists" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "comments_tenant_isolation" ON "comments" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "companies_tenant_isolation" ON "companies" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_tenant_isolation" ON "contacts" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "custom_field_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_field_values_tenant_isolation" ON "custom_field_values" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_fields_tenant_isolation" ON "custom_fields" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deals_tenant_isolation" ON "deals" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_versions_tenant_isolation" ON "document_versions" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "embeddings_tenant_isolation" ON "embeddings" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "expenses_tenant_isolation" ON "expenses" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "form_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "form_submissions_tenant_isolation" ON "form_submissions" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "forms_tenant_isolation" ON "forms" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "goals_tenant_isolation" ON "goals" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "integrations_tenant_isolation" ON "integrations" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invitation_tenant_isolation" ON "invitation" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoice_lines_tenant_isolation" ON "invoice_lines" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "key_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "key_results_tenant_isolation" ON "key_results" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "labels_tenant_isolation" ON "labels" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "member_tenant_isolation" ON "member" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mentions_tenant_isolation" ON "mentions" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "milestones_tenant_isolation" ON "milestones" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_preferences_tenant_isolation" ON "notification_preferences" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "project_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "project_budgets_tenant_isolation" ON "project_budgets" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "project_costs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "project_costs_tenant_isolation" ON "project_costs" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "project_members_tenant_isolation" ON "project_members" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "projects_tenant_isolation" ON "projects" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reactions_tenant_isolation" ON "reactions" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "saved_views_tenant_isolation" ON "saved_views" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "spaces_tenant_isolation" ON "spaces" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sprints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sprints_tenant_isolation" ON "sprints" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "task_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_assignees_tenant_isolation" ON "task_assignees" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "task_dependencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_dependencies_tenant_isolation" ON "task_dependencies" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "task_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_labels_tenant_isolation" ON "task_labels" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "task_statuses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_statuses_tenant_isolation" ON "task_statuses" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "task_watchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_watchers_tenant_isolation" ON "task_watchers" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "team" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "team_tenant_isolation" ON "team" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "templates_tenant_isolation" ON "templates" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "time_entries_tenant_isolation" ON "time_entries" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "timesheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "timesheets_tenant_isolation" ON "timesheets" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_counters_tenant_isolation" ON "usage_counters" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhook_deliveries_tenant_isolation" ON "webhook_deliveries" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhooks_tenant_isolation" ON "webhooks" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

