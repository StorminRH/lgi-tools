ALTER TABLE "market_prices" ALTER COLUMN "stale_after" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "market_history_meta" ALTER COLUMN "stale_after" DROP NOT NULL;