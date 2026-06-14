CREATE TABLE "market_history" (
	"type_id" integer NOT NULL,
	"date" date NOT NULL,
	"average" double precision NOT NULL,
	"highest" double precision NOT NULL,
	"lowest" double precision NOT NULL,
	"volume" bigint NOT NULL,
	"order_count" integer NOT NULL,
	CONSTRAINT "market_history_type_id_date_pk" PRIMARY KEY("type_id","date")
);
--> statement-breakpoint
CREATE TABLE "market_history_meta" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "buy_depth" jsonb;--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "sell_depth" jsonb;