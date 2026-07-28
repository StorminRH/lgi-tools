CREATE TYPE "public"."wh_statics_snapshot_status" AS ENUM('pending', 'promoted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "wh_statics_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feed_version" text NOT NULL,
	"etag" text NOT NULL,
	"last_modified" text,
	"digest" text NOT NULL,
	"system_count" integer NOT NULL,
	"status" "wh_statics_snapshot_status" DEFAULT 'pending' NOT NULL,
	"entries" jsonb NOT NULL,
	"diff" jsonb NOT NULL,
	"cross_check" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wh_system_statics" (
	"system_id" integer NOT NULL,
	"code" text NOT NULL,
	"version" text NOT NULL,
	"snapshot_id" bigint NOT NULL,
	CONSTRAINT "wh_system_statics_system_id_code_pk" PRIMARY KEY("system_id","code")
);
