CREATE TABLE "corp_industry_job_syncs" (
	"user_id" text NOT NULL,
	"corporation_id" bigint NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"jobs_etag" text,
	"sync_error" text,
	CONSTRAINT "corp_industry_job_syncs_user_id_corporation_id_pk" PRIMARY KEY("user_id","corporation_id")
);
--> statement-breakpoint
CREATE TABLE "corp_industry_jobs" (
	"user_id" text NOT NULL,
	"corporation_id" bigint NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "corp_industry_jobs_user_id_corporation_id_pk" PRIMARY KEY("user_id","corporation_id")
);
