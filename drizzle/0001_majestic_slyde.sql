-- Wipe the Session-2 hand-typed seed row. The Sheet is now source of truth.
DELETE FROM "sites";--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"wave_id" integer NOT NULL,
	"order_in_wave" integer NOT NULL,
	"trigger_label" text,
	"quantity" integer NOT NULL,
	"sleeper_name" text NOT NULL,
	"sleeper_class_code" text NOT NULL,
	"scram" integer,
	"web" integer,
	"neut" integer,
	"rrep" integer,
	"sig" integer,
	"speed" integer,
	"distance" integer,
	"velocity" integer,
	"dps" integer,
	"alpha" integer,
	"ehp" integer
);
--> statement-breakpoint
CREATE TABLE "site_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"order_in_site" integer NOT NULL,
	"resource_kind" text NOT NULL,
	"resource_name" text NOT NULL,
	"units" bigint,
	"volume_m3" bigint,
	"isk_per_m3" integer,
	"total_isk" bigint
);
--> statement-breakpoint
CREATE TABLE "waves" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"wave_number" integer NOT NULL,
	"wave_label" text NOT NULL,
	"ew_scram" integer,
	"ew_web" integer,
	"ew_neut" integer,
	"ew_rrep" integer,
	"dps_total" integer,
	"alpha_total" integer,
	"ehp_total" integer
);
--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "wormhole_class" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "source_tab" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "signature_label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "blue_loot_isk" bigint;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "isk_per_ehp" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "resource_value_isk" bigint;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_wave_id_waves_id_fk" FOREIGN KEY ("wave_id") REFERENCES "public"."waves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_resources" ADD CONSTRAINT "site_resources_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "npcs_wave_order_unique" ON "npcs" USING btree ("wave_id","order_in_wave");--> statement-breakpoint
CREATE UNIQUE INDEX "site_resources_site_order_unique" ON "site_resources" USING btree ("site_id","order_in_site");--> statement-breakpoint
CREATE UNIQUE INDEX "waves_site_wave_number_unique" ON "waves" USING btree ("site_id","wave_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_source_tab_name_unique" ON "sites" USING btree ("source_tab","name");--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "description";