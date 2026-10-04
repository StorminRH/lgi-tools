CREATE TYPE "public"."codex_revision_origin" AS ENUM('admin', 'proposal', 'revert');--> statement-breakpoint
CREATE TABLE "codex_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"title" text NOT NULL,
	"current_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codex_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"parent_revision_id" uuid,
	"doc" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"user_id" text,
	"character_id" bigint,
	"origin" "codex_revision_origin" NOT NULL,
	"origin_ref" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codex_pages" ADD CONSTRAINT "codex_pages_current_revision_id_codex_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."codex_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_revisions" ADD CONSTRAINT "codex_revisions_page_id_codex_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."codex_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_revisions" ADD CONSTRAINT "codex_revisions_parent_revision_id_codex_revisions_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."codex_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_revisions" ADD CONSTRAINT "codex_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_revisions" ADD CONSTRAINT "codex_revisions_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codex_pages_subject_unique" ON "codex_pages" USING btree ("subject_kind","subject_key");--> statement-breakpoint
CREATE INDEX "codex_revisions_page_idx" ON "codex_revisions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "codex_revisions_user_idx" ON "codex_revisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "codex_revisions_character_idx" ON "codex_revisions" USING btree ("character_id");