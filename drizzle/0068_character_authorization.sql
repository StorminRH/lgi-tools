ALTER TABLE "account" ADD COLUMN "authorization_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "authorization_next_check_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "authorization_failure_first_at" timestamp;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "authorization_failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "authorization_suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "authorization_access_changed_at" timestamp;