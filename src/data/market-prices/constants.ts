// Shared constants for the market-prices slice. Lives in its own module so
// that client components (like the PriceFreshness nav chip) can import them
// without pulling the server-only cache.ts / ingest.ts modules — and their
// drizzle / postgres dependencies — into the client bundle.

/**
 * Per-row TTL. Every write sets stale_after = NOW() + STALE_AFTER_TTL_MS.
 * Its only remaining role is the "last refreshed" marker the nightly sweep
 * keys off: `listStaleTypeIds` selects rows with stale_after \< NOW(), so a
 * ~24h TTL means the sweep re-fetches anything not refreshed in the last day
 * — matching the nightly cron cadence ("30 11 * * *") and skipping types an
 * on-demand view already refreshed today. It does NOT gate the live view path:
 * `getLivePrices` always fetches live regardless of staleAfter.
 */
export const STALE_AFTER_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The Forge region — Jita. The same number that REGION_ID was in
 * source-fallback.ts; promoted to a shared constant now that two source
 * implementations use it.
 */
export const ESI_REGION_ID_FORGE = 10000002;

/**
 * Jita IV - Moon 4 - Caldari Navy Assembly Plant, the hub every stored price
 * describes (3.7.26.1). The region dump is still the fetch (one paginated
 * stream is cheaper than per-type calls at bulk size), but ONLY orders at
 * this station enter the stored book — both sides. The buy side is
 * hub-station-only by ruling (2026-07-10, diagnosis in docs/margin-audit/
 * hub-scoping-ruling-sheet.md): range-aware reachability was measured and
 * rejected — region-range lowball bid walls inflate the dust threshold past
 * the real Jita bids on ~12% of types and dilute pct5_buy on ~20%, and
 * Fuzzwork's station aggregates (the fallback source) are station-local
 * too, so this rule is also what keeps the two sources from flapping.
 * Hardcoded here rather than resolved from eve-data: this slice stays in
 * pure number space (see schema.ts header).
 */
export const JITA_44_STATION_ID = 60003760;

/**
 * NPC-station ceiling for regional-discount candidates (3.7.26.1 ruling):
 * player-structure order books (location ids ~1e12) never anchor a callout —
 * a structure can be ACL-gated so the "opportunity" may not be dockable, and
 * every observed candidate in the calibration set was an NPC station anyway.
 */
export const NPC_STATION_ID_CEILING = 1e9;

/**
 * Regional-discount callout gate (3.7.26.1): the best non-hub sell
 * opportunity is stored only when it beats the hub price by at least this
 * percentage AND carries at least this many units priced at-or-under the
 * hub best (per-station dust discipline applies first). Calibrated on the
 * 2026-07-10 fleet-wide candidate distribution (85 of 4,706 hub-priced
 * types fire at 15%/10 — the RLML class passes at −89%/19 units; 1-unit
 * relic-trade curiosities fail); ruled values, same review bar as the dust
 * divisor above.
 */
export const REGIONAL_DISCOUNT_MIN_PCT = 15;
/**
 * Minimum item quantity required for regional discount to be considered representative.
 */
export const REGIONAL_DISCOUNT_MIN_UNITS = 10;

/**
 * Stale-set size at which the ESI region-dump (one paginated stream of
 * every order in The Forge) becomes cheaper than fetching each type one
 * by one. Below the threshold the dispatcher uses the per-type endpoint;
 * at or above it switches to the region-dump path. 100 is a guess that's
 * comfortable for the 54-row 3.0.3 state and the ~6,000-row 3.0.4 load;
 * revisit if real production timing data justifies tuning either way.
 */
export const BULK_THRESHOLD = 100;

/**
 * Max concurrent page fetches inside the ESI region-dump. Jita has
 * ~400–600 pages; 8 keeps the dispatch pipeline saturated without
 * hammering ESI or our own outbound connection budget.
 */
export const PAGE_CONCURRENCY = 8;

/**
 * Max concurrent per-type ESI fetches. The 54-row daily cron hits this
 * at 10-wide and finishes in ~6 batches.
 */
export const PER_TYPE_CONCURRENCY = 10;

/**
 * IP-keyed rate limit on the public on-demand refresh trigger
 * (/api/market-prices/refresh). 20 requests per minute is generous for the
 * real consumer (3.0.5's Industry Planner client refreshes one blueprint's
 * stale rows per user action) while clearly throttling a scraper. Bumped
 * up or down post-ship from the Upstash analytics dashboard.
 */
export const ON_DEMAND_REFRESH_LIMIT_PER_MINUTE = 20;

/**
 * Hard cap on the number of typeIds a single on-demand refresh call may
 * request. Matches the practical upper bound for a single blueprint's
 * flattened-materials list (T2 hulls hit ~25; capital BPCs may approach
 * the cap — revisit if a real consumer exceeds it).
 */
export const ON_DEMAND_REFRESH_MAX_TYPE_IDS = 50;

/**
 * Price-distance bands (percent from the BEST price on each side) for the
 * near-touch depth ladder (3.5.3a). Each band's cumulative volume answers
 * "how far would dumping Q walk the price" for the 3.5.3b Market Score.
 *
 * Anchored to the DUST-FILTERED best (see BEST_DUST_VOLUME_DIVISOR), NOT pct5:
 * pct5 is volume-weighted over 5% of total side volume, so a far-out
 * huge-volume order inflates that total and collapses pct5 to the fake price —
 * any pct5-anchored band would move with it. Banding from the best is robust:
 * a tiny 0.01-ISK spoof shifts the band window negligibly (≥0.5% ≫ 0.01 ISK)
 * and contributes ~0 volume, and a far-out fake falls outside the near-touch
 * bands, under-stating depth — the safe direction for a "can I dump this?"
 * read. The one case that argument used to concede — a mid-gap sliver ask a
 * few percent under the real book, which windowed the bands around ITSELF and
 * excluded the real sell wall (over-stating scarcity AND letting the fake
 * price anchor the ladder) — is closed by the dust filter: a sliver never
 * becomes the anchor, so the bands window around a price with real volume
 * behind it (3.7.25.1).
 */
export const DEPTH_BANDS_PCT = [0.5, 1, 2, 5, 10] as const;

/**
 * Dust threshold for the stored best price (3.7.25.1): the best is the lowest
 * ask / highest bid with REAL volume behind it — the front of the book is
 * walked until cumulative volume reaches ceil(side volume / this divisor)
 * (0.1% of side volume, min 1 unit), and the order that crosses that line is
 * the best. A healthy front order carries the threshold alone, so liquid books
 * are byte-identical to the raw touch; a 1-unit sliver anchoring a
 * multi-thousand-unit book is skipped. Calibration and the ruling live in the
 * 2026-07-02 best_sell hardening report (docs/margin-audit/): ~20% of liquid
 * products carried a divergent front order at any instant, the worst as
 * [1,1,1,1,1] ladders on 4,000–10,000-unit books.
 */
export const BEST_DUST_VOLUME_DIVISOR = BigInt(1000);
