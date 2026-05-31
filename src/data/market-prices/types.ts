// Public-facing record returned by getPrices() and stored in the DB.
// All four price columns are nullable: NULL means "no orders on that
// side at the time of the last refresh."
export interface MarketPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  // Order-book depth on each side (null = no orders there at last refresh).
  // Carried alongside the price so consumers can judge liquidity, not just
  // price (e.g. the planner's price-confidence badge).
  buyVolume: bigint | null;
  sellVolume: bigint | null;
  // Provenance of this row — ESI (happy path) vs the Fuzzwork fallback.
  source: PriceSource;
  updatedAt: Date;
  // Row-level expiry — the authoritative staleness signal (the bulk refresh
  // keys off `stale_after < NOW()`). A row can have a null price yet a future
  // stale_after (the last refresh confirmed no orders); on-demand callers must
  // honour that rather than re-fetching null-priced rows every time.
  staleAfter: Date;
}

// Source attribution stored on every market_prices row. 'esi' is the
// happy path (3.0.3+). 'fuzzwork-fallback' is the circuit-breaker target
// when ESI is degraded. 'fuzzwork' stays legal so pre-3.0.3 rows in
// production still validate against this union; new writes never use
// the bare 'fuzzwork' literal.
export type PriceSource = 'esi' | 'fuzzwork-fallback' | 'fuzzwork';

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
