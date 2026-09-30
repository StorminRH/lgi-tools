CREATE TABLE "pending_tracking_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_user_id" text NOT NULL,
	"selections" jsonb NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_tracking_merges" ADD CONSTRAINT "pending_tracking_merges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_tracking_merges_user_idx" ON "pending_tracking_merges" USING btree ("user_id");