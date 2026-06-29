CREATE TABLE "character_skill_syncs" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"queue_etag" text,
	"skills_etag" text
);
--> statement-breakpoint
CREATE TABLE "character_skills" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"total_sp" bigint NOT NULL,
	"unallocated_sp" bigint,
	"queue" jsonb DEFAULT '[]'::jsonb NOT NULL
);
