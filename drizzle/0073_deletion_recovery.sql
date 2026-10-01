CREATE TABLE "pending_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"account_row_id" text,
	"character_id" integer,
	"character_ids" jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_deletions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tracking_receipt_cleanup" (
	"task" text PRIMARY KEY DEFAULT 'merge_tracking_receipts' NOT NULL,
	"cutoff_ms" bigint NOT NULL,
	"cursor" text,
	CONSTRAINT "tracking_receipt_cleanup_singleton" CHECK ("tracking_receipt_cleanup"."task" = 'merge_tracking_receipts')
);
--> statement-breakpoint
CREATE INDEX "pending_deletions_queue_idx" ON "pending_deletions" USING btree ("queued_at","id");