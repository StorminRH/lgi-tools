CREATE TABLE "type_dogma" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"attributes" jsonb NOT NULL
);
--> statement-breakpoint
DROP TABLE "dgm_type_attributes" CASCADE;--> statement-breakpoint
DROP TABLE "industry_activities" CASCADE;--> statement-breakpoint
DROP TABLE "industry_activity_materials" CASCADE;--> statement-breakpoint
DROP TABLE "industry_activity_products" CASCADE;--> statement-breakpoint
-- industry_blueprints is fully wiped + refilled by the SDE ingest that runs
-- immediately after this migration (the type_dogma emptiness gate triggers it),
-- so clear the existing rows before adding the NOT NULL activities column —
-- ADD COLUMN ... NOT NULL would otherwise fail against the populated table. The
-- CASCADE also clears blueprint_trees / blueprint_flat_materials (recomputed by
-- the post-ingest tree resolver).
TRUNCATE TABLE "industry_blueprints" CASCADE;--> statement-breakpoint
ALTER TABLE "industry_blueprints" ADD COLUMN "activities" jsonb NOT NULL;