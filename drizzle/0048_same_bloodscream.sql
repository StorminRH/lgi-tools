CREATE TABLE "domain_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "domain_events_occurred_idx" ON "domain_events" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "domain_events_type_occurred_idx" ON "domain_events" USING btree ("event_type","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);