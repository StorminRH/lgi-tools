CREATE TABLE "corp_access_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"character_id" bigint,
	"corporation_id" bigint NOT NULL,
	"allowed" boolean NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "corp_access_audit_corp_decided_idx" ON "corp_access_audit" USING btree ("corporation_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "corp_access_audit_allowed_decided_idx" ON "corp_access_audit" USING btree ("allowed","decided_at" DESC NULLS LAST);