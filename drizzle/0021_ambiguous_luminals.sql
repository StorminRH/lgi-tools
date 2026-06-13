CREATE TABLE "adjusted_prices" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"adjusted_price" double precision,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_cost_indices" (
	"solar_system_id" integer NOT NULL,
	"activity" text NOT NULL,
	"cost_index" double precision NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "industry_cost_indices_solar_system_id_activity_pk" PRIMARY KEY("solar_system_id","activity")
);
