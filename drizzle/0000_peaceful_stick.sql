CREATE TYPE "public"."site_type" AS ENUM('combat', 'gas', 'ore', 'relic', 'data');--> statement-breakpoint
CREATE TYPE "public"."wormhole_class" AS ENUM('C1', 'C2', 'C3', 'C4', 'C5', 'C6');--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"site_type" "site_type" NOT NULL,
	"wormhole_class" "wormhole_class" NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
