ALTER TABLE "account" ADD COLUMN "deletion_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deletion_requested_at" timestamp;