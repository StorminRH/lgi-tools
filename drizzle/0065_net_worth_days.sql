CREATE TABLE "net_worth_days" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"net_worth" double precision NOT NULL,
	"liquid_isk" double precision NOT NULL,
	"pilots_included" smallint NOT NULL,
	"pilots_total" smallint NOT NULL,
	"pilots" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "net_worth_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "net_worth_days" ADD CONSTRAINT "net_worth_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;