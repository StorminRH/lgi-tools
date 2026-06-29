CREATE TABLE "character_industry_job_syncs" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"jobs_etag" text
);
--> statement-breakpoint
CREATE TABLE "character_industry_jobs" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
