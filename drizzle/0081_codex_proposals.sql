CREATE TYPE "public"."codex_proposal_status" AS ENUM('pending', 'approved', 'denied', 'withdrawn');--> statement-breakpoint
CREATE TABLE "codex_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"page_title" text NOT NULL,
	"base_revision_id" uuid,
	"section_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"user_id" text NOT NULL,
	"character_id" bigint NOT NULL,
	"summary" text NOT NULL,
	"status" "codex_proposal_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"result_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "codex_proposals_approved_has_result" CHECK (("codex_proposals"."status" = 'approved') = ("codex_proposals"."result_revision_id" IS NOT NULL)),
	CONSTRAINT "codex_proposals_pending_undecided" CHECK (("codex_proposals"."status" = 'pending') = ("codex_proposals"."decided_at" IS NULL)),
	CONSTRAINT "codex_proposals_denied_has_note" CHECK ("codex_proposals"."status" <> 'denied' OR coalesce(length(trim("codex_proposals"."review_note")), 0) > 0)
);
--> statement-breakpoint
ALTER TABLE "codex_proposals" ADD CONSTRAINT "codex_proposals_base_revision_id_codex_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."codex_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_proposals" ADD CONSTRAINT "codex_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_proposals" ADD CONSTRAINT "codex_proposals_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_proposals" ADD CONSTRAINT "codex_proposals_result_revision_id_codex_revisions_id_fk" FOREIGN KEY ("result_revision_id") REFERENCES "public"."codex_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_proposals_status_idx" ON "codex_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "codex_proposals_user_idx" ON "codex_proposals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "codex_proposals_user_pending_idx" ON "codex_proposals" USING btree ("user_id","subject_kind","subject_key") WHERE "codex_proposals"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "codex_revisions_proposal_unique" ON "codex_revisions" USING btree ("origin_ref") WHERE "codex_revisions"."origin" = 'proposal';