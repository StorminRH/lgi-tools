CREATE TYPE "public"."wh_observation_provenance" AS ENUM('jump-verified', 'human', 'confirmed', 'assumed');--> statement-breakpoint
CREATE TABLE "wh_observations" (
	"solar_system_id" bigint NOT NULL,
	"wh_type_code" varchar(4) NOT NULL,
	"provenance" "wh_observation_provenance" NOT NULL,
	"observed_at" timestamp (0) with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	CONSTRAINT "wh_observations_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "wh_observations_attributable_type" CHECK ("wh_observations"."wh_type_code" <> 'K162'),
	CONSTRAINT "wh_observations_verified_provenance" CHECK ("wh_observations"."provenance" <> 'assumed'),
	CONSTRAINT "wh_observations_hour_coarse" CHECK ("wh_observations"."observed_at" = date_trunc('hour', "wh_observations"."observed_at"))
);
