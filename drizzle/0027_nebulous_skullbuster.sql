ALTER TABLE "characters" ADD COLUMN "corporation_id" bigint;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "alliance_id" bigint;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "faction_id" bigint;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "affiliation_refreshed_at" timestamp;