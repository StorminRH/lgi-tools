CREATE TYPE "public"."esi_response_holder" AS ENUM('character', 'corporation', 'global');--> statement-breakpoint
CREATE TABLE "esi_responses" (
	"route" text NOT NULL,
	"holder_type" "esi_response_holder" NOT NULL,
	"holder_id" bigint NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"params" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"etags" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_modified" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL,
	"body" jsonb,
	CONSTRAINT "esi_responses_route_holder_type_holder_id_user_id_params_pk" PRIMARY KEY("route","holder_type","holder_id","user_id","params")
);
--> statement-breakpoint
CREATE INDEX "esi_responses_holder_idx" ON "esi_responses" USING btree ("holder_type","holder_id");