CREATE TYPE "public"."wh_statics_snapshot_status" AS ENUM('pending', 'promoted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "wh_statics_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feed_version" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"digest" text NOT NULL,
	"system_count" integer NOT NULL,
	"status" "wh_statics_snapshot_status" NOT NULL,
	"entries" jsonb NOT NULL,
	"difference" jsonb NOT NULL,
	"cross_check" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wh_system_statics" (
	"system_id" integer NOT NULL,
	"code" text NOT NULL,
	"source_snapshot_id" bigint NOT NULL,
	"source_version" text NOT NULL,
	CONSTRAINT "wh_system_statics_system_id_code_pk" PRIMARY KEY("system_id","code")
);
