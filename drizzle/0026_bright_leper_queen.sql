CREATE TABLE "eve_system_jumps" (
	"from_system_id" integer NOT NULL,
	"to_system_id" integer NOT NULL,
	CONSTRAINT "eve_system_jumps_from_system_id_to_system_id_pk" PRIMARY KEY("from_system_id","to_system_id")
);
--> statement-breakpoint
ALTER TABLE "eve_solar_systems" ADD COLUMN "wormhole_class_id" integer;--> statement-breakpoint
ALTER TABLE "eve_system_jumps" ADD CONSTRAINT "eve_system_jumps_from_system_id_eve_solar_systems_id_fk" FOREIGN KEY ("from_system_id") REFERENCES "public"."eve_solar_systems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_system_jumps" ADD CONSTRAINT "eve_system_jumps_to_system_id_eve_solar_systems_id_fk" FOREIGN KEY ("to_system_id") REFERENCES "public"."eve_solar_systems"("id") ON DELETE restrict ON UPDATE no action;