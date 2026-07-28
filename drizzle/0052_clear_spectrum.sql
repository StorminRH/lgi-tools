CREATE TYPE "public"."wh_statics_snapshot_status" AS ENUM('pending', 'promoted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "wh_statics_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feed_version" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"digest" text NOT NULL,
	"system_count" integer NOT NULL,
	"status" "wh_statics_snapshot_status" DEFAULT 'pending' NOT NULL,
	"entries" jsonb NOT NULL,
	"difference" jsonb NOT NULL,
	"cross_check" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wh_system_statics" (
	"system_id" bigint NOT NULL,
	"code" text NOT NULL,
	"source_snapshot_id" bigint NOT NULL,
	CONSTRAINT "wh_system_statics_system_id_code_pk" PRIMARY KEY("system_id","code")
);
--> statement-breakpoint
ALTER TABLE "wh_system_statics" ADD CONSTRAINT "wh_system_statics_source_snapshot_id_wh_statics_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."wh_statics_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wh_statics_snapshots_status_created_at_idx" ON "wh_statics_snapshots" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wh_system_statics_source_snapshot_idx" ON "wh_system_statics" USING btree ("source_snapshot_id");