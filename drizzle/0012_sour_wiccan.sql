ALTER TABLE "market_prices" ADD COLUMN "buy_volume" bigint;--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "sell_volume" bigint;--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "stale_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN "source" text DEFAULT 'fuzzwork' NOT NULL;--> statement-breakpoint
UPDATE "market_prices" SET "stale_after" = "updated_at" + INTERVAL '24 hours' WHERE "stale_after" IS NULL;--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "stale_after" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "market_prices_stale_after_idx" ON "market_prices" USING btree ("stale_after");
