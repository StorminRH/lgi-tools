// Public-facing record returned by getPrices() and stored in the DB.
// All four price columns are nullable: NULL means "no orders on that
// side at the time of the last refresh."
export interface MarketPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  updatedAt: Date;
}

// Source attribution stored on every market_prices row. Starts narrow;
// widens to include 'esi' and 'fuzzwork-fallback' in 3.0.3.
export type PriceSource = 'fuzzwork';

// Source-shaped record before persistence. Volume + source are populated
// from the source response; updatedAt + staleAfter are set by the ingest
// layer at write time.
export interface RawMarketPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: bigint | null;
  sellVolume: bigint | null;
  source: PriceSource;
}
