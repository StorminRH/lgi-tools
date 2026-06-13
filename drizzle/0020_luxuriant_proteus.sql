CREATE TABLE "eve_constellations" (
	"id" integer PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_npc_stations" (
	"id" integer PRIMARY KEY NOT NULL,
	"solar_system_id" integer NOT NULL,
	"operation_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"manufacturing_capable" boolean NOT NULL,
	"research_capable" boolean NOT NULL,
	"industry_capable" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_regions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_solar_systems" (
	"id" integer PRIMARY KEY NOT NULL,
	"constellation_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"name" text NOT NULL,
	"security_status" double precision
);
--> statement-breakpoint
CREATE TABLE "eve_station_operations" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eve_constellations" ADD CONSTRAINT "eve_constellations_region_id_eve_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."eve_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_npc_stations" ADD CONSTRAINT "eve_npc_stations_solar_system_id_eve_solar_systems_id_fk" FOREIGN KEY ("solar_system_id") REFERENCES "public"."eve_solar_systems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_npc_stations" ADD CONSTRAINT "eve_npc_stations_operation_id_eve_station_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."eve_station_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_solar_systems" ADD CONSTRAINT "eve_solar_systems_constellation_id_eve_constellations_id_fk" FOREIGN KEY ("constellation_id") REFERENCES "public"."eve_constellations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_solar_systems" ADD CONSTRAINT "eve_solar_systems_region_id_eve_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."eve_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eve_constellations_region_idx" ON "eve_constellations" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "eve_npc_stations_solar_system_idx" ON "eve_npc_stations" USING btree ("solar_system_id");--> statement-breakpoint
CREATE INDEX "eve_npc_stations_operation_idx" ON "eve_npc_stations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "eve_solar_systems_constellation_idx" ON "eve_solar_systems" USING btree ("constellation_id");--> statement-breakpoint
CREATE INDEX "eve_solar_systems_region_idx" ON "eve_solar_systems" USING btree ("region_id");