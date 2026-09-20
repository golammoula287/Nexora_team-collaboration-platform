ALTER TABLE "document_favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_favorites_tenant_isolation" ON "document_favorites" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "space_wiki_homes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "space_wiki_homes_tenant_isolation" ON "space_wiki_homes" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid);
