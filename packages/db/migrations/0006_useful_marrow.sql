CREATE TABLE "document_favorites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_wiki_homes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "selection_from" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "selection_to" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "selection_quote" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_favorites" ADD CONSTRAINT "document_favorites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_favorites" ADD CONSTRAINT "document_favorites_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_favorites" ADD CONSTRAINT "document_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_wiki_homes" ADD CONSTRAINT "space_wiki_homes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_wiki_homes" ADD CONSTRAINT "space_wiki_homes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_wiki_homes" ADD CONSTRAINT "space_wiki_homes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_favorites_user_doc_uq" ON "document_favorites" USING btree ("organization_id","user_id","document_id");--> statement-breakpoint
CREATE INDEX "document_favorites_doc_idx" ON "document_favorites" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_favorites_user_idx" ON "document_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_wiki_homes_space_uq" ON "space_wiki_homes" USING btree ("organization_id","space_id");--> statement-breakpoint
CREATE INDEX "space_wiki_homes_document_idx" ON "space_wiki_homes" USING btree ("document_id");