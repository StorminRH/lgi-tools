// Shared constants for the market-prices slice. Lives in its own module so
// that client components (like the PriceFreshness nav chip) can import them
// without pulling the server-only cache.ts / ingest.ts modules — and their
// drizzle / postgres dependencies — into the client bundle.

// Per-row TTL. Every write sets stale_after = NOW() + STALE_AFTER_TTL_MS.
// Matches the hourly cron cadence in vercel.json ("0 * * * *"). Vercel
// Pro unlocks hourly crons; Hobby was the daily-only constraint. The
// 1h TTL means on-demand callers (Industry Planner blueprint loads)
// can trust freshly-pulled prices for 60 minutes before falling back
// to a per-type ESI refresh.
export const STALE_AFTER_TTL_MS = 60 * 60 * 1000;

// Postgres advisory-lock key for the bulk price refresh path. Arbitrary
// project-unique bigint. Convention if a second lock ever lands: high 32
// bits = feature namespace, low 32 bits = lock kind. Only one lock today,
// so the value is opaque. BigInt(...) call (vs an `n` literal) keeps the
// TS target at ES2017.
export const ADVISORY_LOCK_REFRESH_PRICES = BigInt(8273619012);

// ESI (Eve Online's official API) base URL. Label-less by design: CCP warns
// against the `/latest` label (it can shift behavior when they bump what it
// points at), so we drop it and pin the contract via the X-Compatibility-Date
// header instead (see src/config/esi.ts). `/markets/{region}/orders/` hangs
// off this for both bulk and per-type fetches.
export const ESI_BASE_URL = 'https://esi.evetech.net';

// The Forge region — Jita. The same number that REGION_ID was in
// source-fallback.ts; promoted to a shared constant now that two source
// implementations use it.
export const ESI_REGION_ID_FORGE = 10000002;

// Stale-set size at which the ESI region-dump (one paginated stream of
// every order in The Forge) becomes cheaper than fetching each type one
// by one. Below the threshold the dispatcher uses the per-type endpoint;
// at or above it switches to the region-dump path. 100 is a guess that's
// comfortable for the 54-row 3.0.3 state and the ~6,000-row 3.0.4 load;
// revisit if real production timing data justifies tuning either way.
export const BULK_THRESHOLD = 100;

// Max concurrent page fetches inside the ESI region-dump. Jita has
// ~400–600 pages; 8 keeps the dispatch pipeline saturated without
// hammering ESI or our own outbound connection budget.
export const PAGE_CONCURRENCY = 8;

// Max concurrent per-type ESI fetches. The 54-row daily cron hits this
// at 10-wide and finishes in ~6 batches.
export const PER_TYPE_CONCURRENCY = 10;

// Refuse to dispatch new ESI calls when X-ESI-Error-Limit-Remain falls
// below this floor. ESI's actual ceiling is 100 errors per rolling
// window; a 20-error pre-ban margin gives us enough slack to log and
// fall back to Fuzzwork before the next request would trip the ban.
export const ESI_BUDGET_FLOOR = 20;

// IP-keyed rate limit on the public on-demand refresh trigger
// (/api/market-prices/refresh). 20 requests per minute is generous for the
// real consumer (3.0.5's Industry Planner client refreshes one blueprint's
// stale rows per user action) while clearly throttling a scraper. Bumped
// up or down post-ship from the Upstash analytics dashboard.
export const ON_DEMAND_REFRESH_LIMIT_PER_MINUTE = 20;

// Hard cap on the number of typeIds a single on-demand refresh call may
// request. Matches the practical upper bound for a single blueprint's
// flattened-materials list (T2 hulls hit ~25; capital BPCs may approach
// the cap — revisit if a real consumer exceeds it).
export const ON_DEMAND_REFRESH_MAX_TYPE_IDS = 50;
