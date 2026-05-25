CREATE TYPE "public"."character_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "characters" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"portrait_url" text NOT NULL,
	"role" character_role DEFAULT 'USER' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp DEFAULT now() NOT NULL
);
