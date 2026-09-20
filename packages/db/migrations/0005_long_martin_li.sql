ALTER TABLE "document_versions" ADD COLUMN "content" jsonb;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "title" text DEFAULT 'Untitled' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content" jsonb;
