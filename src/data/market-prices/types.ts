// One rung of the near-touch depth ladder (3.5.3a): the cumulative order
// volume available within `pct`% of the BEST price on a side. Bands are nested
// (0.5% ⊂ 1% ⊂ …), so cumVolume is monotonic non-decreasing across the ladder.
// cumVolume is a plain number — realistic Jita cumulative volumes stay well
// under MAX_SAFE_INTEGER, matching computeSide's existing Number() math.
export interface DepthBand {
  pct: number;
  cumVolume: number;
}

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
  // Near-touch depth ladder per side (null = no orders there at last refresh).
  // Cumulative volume within DEPTH_BANDS_PCT of the best, for the 3.5.3b
  // depth-absorption signal. See DEPTH_BANDS_PCT for why it's anchored to best.
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
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
  // Near-touch depth ladder per side, computed from the order book the source
  // already downloads (null = no orders on that side). The Fuzzwork fallback
  // has no order-book, so it leaves these null.
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
  source: PriceSource;
}
