// One rung of the near-touch depth ladder (3.5.3a): the cumulative order
// volume available within `pct`% of the BEST price on a side. Bands are nested
// (0.5% ⊂ 1% ⊂ …), so cumVolume is monotonic non-decreasing across the ladder.
// cumVolume is a plain number — realistic Jita cumulative volumes stay well
// under MAX_SAFE_INTEGER, matching computeSide's existing Number() math.
export interface DepthBand {
  pct: number;
  cumVolume: number;
}

// The best single non-hub sell opportunity for a type (3.7.26.1) — computed
// by the same ingest pass that scopes the stored book to Jita 4-4, from the
// region orders the scoping filters out. All fields are plain numbers (this
// rides a jsonb column; BigInt would throw at serialization). `pct` is the
// discount vs the HUB best sell; `units` is the winning station's volume
// priced at-or-under the hub best, after that station's own dust walk.
// System id, never a station/structure id — the UI resolves it to a system
// name from the SDE. NULL on a row means no opportunity cleared the gate
// (or the row predates the field / came from the Fuzzwork fallback, which
// has no order book to fold over).
export interface RegionalDiscount {
  systemId: number;
  price: number;
  units: number;
  pct: number;
}

// The priced figures shared by the stored row (MarketPrice) and the
// source-shaped row (RawMarketPrice) — one field list so the two can't
// drift. All four price columns are nullable: NULL means "no orders on
// that side at the time of the last refresh."
interface PricedFigures {
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
  // depth-absorption signal. See DEPTH_BANDS_PCT for why it's anchored to
  // best. The Fuzzwork fallback has no order book, so it leaves these null.
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
  // Best single non-hub sell opportunity (null = none cleared the gate, the
  // row predates the field, or the row came from the book-less fallback).
  regionalDiscount: RegionalDiscount | null;
  // Provenance of this row — ESI (happy path) vs the Fuzzwork fallback.
  source: PriceSource;
}

// Public-facing record returned by getPrices() and stored in the DB.
export interface MarketPrice extends PricedFigures {
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
export type RawMarketPrice = PricedFigures;
