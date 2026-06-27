CREATE TYPE "public"."owned_blueprint_owner_type" AS ENUM('character', 'corporation');--> statement-breakpoint
CREATE TABLE "owned_blueprint_syncs" (
	"owner_type" "owned_blueprint_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"page_etags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "owned_blueprint_syncs_owner_type_owner_id_pk" PRIMARY KEY("owner_type","owner_id")
);
--> statement-breakpoint
CREATE TABLE "owned_blueprints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_type" "owned_blueprint_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"material_efficiency" integer NOT NULL,
	"time_efficiency" integer NOT NULL,
	"runs" integer NOT NULL,
	"quantity" integer NOT NULL,
	"location_id" bigint NOT NULL,
	"location_flag" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "owned_blueprints_owner_idx" ON "owned_blueprints" USING btree ("owner_type","owner_id");