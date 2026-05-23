CREATE TABLE "market_prices" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"best_buy" double precision,
	"best_sell" double precision,
	"pct5_buy" double precision,
	"pct5_sell" double precision,
	"updated_at" timestamp with time zone NOT NULL
);
