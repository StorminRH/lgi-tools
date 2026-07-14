CREATE TYPE "public"."esi_snapshot_owner_type" AS ENUM('character', 'corporation');--> statement-breakpoint
CREATE TABLE "esi_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_type" "esi_snapshot_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"etag" text,
	"response_headers" jsonb NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"source_version" text NOT NULL,
	"body_ciphertext" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owned_assets" ADD COLUMN "snapshot_id" bigint;--> statement-breakpoint
CREATE INDEX "esi_snapshots_owner_endpoint_fetched_idx" ON "esi_snapshots" USING btree ("owner_type","owner_id","endpoint","fetched_at","id");--> statement-breakpoint
CREATE INDEX "esi_snapshots_fetched_at_idx" ON "esi_snapshots" USING btree ("fetched_at");--> statement-breakpoint
ALTER TABLE "owned_assets" ADD CONSTRAINT "owned_assets_snapshot_id_esi_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."esi_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owned_assets_snapshot_idx" ON "owned_assets" USING btree ("snapshot_id");