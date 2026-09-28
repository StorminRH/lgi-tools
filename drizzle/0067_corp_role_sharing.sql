ALTER TYPE "public"."esi_refresh_dataset" ADD VALUE 'corp_context';--> statement-breakpoint
ALTER TABLE "corp_structure_sharing" RENAME TO "corp_data_sharing";--> statement-breakpoint
ALTER TABLE "corp_data_sharing" RENAME CONSTRAINT "corp_structure_sharing_pkey" TO "corp_data_sharing_pkey";--> statement-breakpoint
CREATE TABLE "corp_member_roles" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"corporation_id" bigint,
	"roles" text[] NOT NULL,
	"roles_at_hq" text[] NOT NULL,
	"roles_at_base" text[] NOT NULL,
	"roles_at_other" text[] NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corp_holding_nodes" (
	"corporation_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"root_id" bigint,
	"division" integer,
	"deliveries" boolean DEFAULT false NOT NULL,
	"containers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "corp_holding_nodes_corporation_id_item_id_pk" PRIMARY KEY("corporation_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "corp_member_bases" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"corporation_id" bigint NOT NULL,
	"base_id" bigint
);
--> statement-breakpoint
CREATE TABLE "corp_profiles" (
	"corporation_id" bigint PRIMARY KEY NOT NULL,
	"hq_station_id" bigint,
	"division_names" jsonb NOT NULL,
	"container_names" jsonb NOT NULL,
	"structure_names" jsonb NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corp_member_roles" ADD CONSTRAINT "corp_member_roles_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corp_member_bases_corporation_idx" ON "corp_member_bases" USING btree ("corporation_id");--> statement-breakpoint
DELETE FROM "owned_asset_syncs" WHERE "owner_type" = 'corporation';--> statement-breakpoint
DELETE FROM "owned_blueprint_syncs" WHERE "owner_type" = 'corporation';
