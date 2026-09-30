ALTER TABLE "owned_blueprints" ADD COLUMN "item_id" bigint;--> statement-breakpoint
DELETE FROM "owned_blueprint_syncs" WHERE "owner_type" = 'corporation';
