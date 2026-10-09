CREATE TYPE "public"."codex_asset_status" AS ENUM('pending', 'published', 'removed');--> statement-breakpoint
CREATE TABLE "codex_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"variants" jsonb NOT NULL,
	"user_id" text,
	"character_id" bigint,
	"status" "codex_asset_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "codex_assets_published_has_time" CHECK (("codex_assets"."status" = 'published') = ("codex_assets"."published_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "codex_assets" ADD CONSTRAINT "codex_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_assets" ADD CONSTRAINT "codex_assets_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codex_assets_user_sha_unique" ON "codex_assets" USING btree ("user_id","sha256") WHERE "codex_assets"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "codex_assets_status_idx" ON "codex_assets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "codex_assets_user_idx" ON "codex_assets" USING btree ("user_id","created_at");