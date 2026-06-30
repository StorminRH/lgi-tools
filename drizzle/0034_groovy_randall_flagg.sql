CREATE TYPE "public"."security_class" AS ENUM('high', 'low', 'null', 'wormhole');--> statement-breakpoint
CREATE TABLE "corp_structure_syncs" (
	"corporation_id" bigint PRIMARY KEY NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"page_etags" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corp_structures" (
	"corporation_id" bigint NOT NULL,
	"structure_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"system_id" integer NOT NULL,
	"security_class" "security_class" NOT NULL,
	"name" text,
	CONSTRAINT "corp_structures_corporation_id_structure_id_pk" PRIMARY KEY("corporation_id","structure_id")
);
