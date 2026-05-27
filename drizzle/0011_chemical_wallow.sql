CREATE TABLE "usage_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"character_id" bigint,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_character_id_characters_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_logs_timestamp_idx" ON "usage_logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_logs_action_timestamp_idx" ON "usage_logs" USING btree ("action","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_logs_character_timestamp_idx" ON "usage_logs" USING btree ("character_id","timestamp" DESC NULLS LAST);