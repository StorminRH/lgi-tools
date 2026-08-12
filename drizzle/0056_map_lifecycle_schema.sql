ALTER TABLE "maps" ADD COLUMN "tombstoned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "purge_requested_at" timestamp with time zone;
