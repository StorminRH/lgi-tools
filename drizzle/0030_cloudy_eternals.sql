CREATE TYPE "public"."owned_asset_owner_type" AS ENUM('character', 'corporation');--> statement-breakpoint
CREATE TABLE "owned_asset_syncs" (
	"owner_type" "owned_asset_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"page_etags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "owned_asset_syncs_owner_type_owner_id_pk" PRIMARY KEY("owner_type","owner_id")
);
--> statement-breakpoint
CREATE TABLE "owned_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_type" "owned_asset_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" bigint NOT NULL,
	"location_id" bigint NOT NULL,
	"location_flag" text NOT NULL,
	"location_type" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "owned_assets_owner_idx" ON "owned_assets" USING btree ("owner_type","owner_id","type_id");