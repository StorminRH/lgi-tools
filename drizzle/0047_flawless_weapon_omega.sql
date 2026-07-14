CREATE TYPE "public"."esi_refresh_dataset" AS ENUM('skills', 'character_industry_jobs', 'corporation_industry_jobs', 'owned_blueprints', 'owned_assets');--> statement-breakpoint
CREATE TYPE "public"."esi_refresh_job_status" AS ENUM('queued', 'running', 'deferred_for_budget', 'succeeded', 'failed_retryable', 'failed_permanent', 'dead_lettered');--> statement-breakpoint
CREATE TYPE "public"."esi_refresh_owner_type" AS ENUM('character', 'corporation');--> statement-breakpoint
CREATE TABLE "esi_refresh_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dataset" "esi_refresh_dataset" NOT NULL,
	"user_id" text NOT NULL,
	"owner_type" "esi_refresh_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"resource" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "esi_refresh_job_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"budget_reason" text,
	"budget_remaining" integer,
	"retry_after_seconds" integer,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "esi_refresh_jobs_live_key_unique" ON "esi_refresh_jobs" USING btree ("idempotency_key") WHERE "esi_refresh_jobs"."status" in ('queued', 'running', 'deferred_for_budget', 'failed_retryable');--> statement-breakpoint
CREATE INDEX "esi_refresh_jobs_due_idx" ON "esi_refresh_jobs" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "esi_refresh_jobs_finished_idx" ON "esi_refresh_jobs" USING btree ("status","finished_at");--> statement-breakpoint
CREATE INDEX "esi_refresh_jobs_user_idx" ON "esi_refresh_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "esi_refresh_jobs_owner_idx" ON "esi_refresh_jobs" USING btree ("owner_type","owner_id");