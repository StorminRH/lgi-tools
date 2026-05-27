// Shared constants for the market-prices slice. Lives in its own module so
// that client components (like the PriceFreshness nav chip) can import them
// without pulling the server-only cache.ts / ingest.ts modules — and their
// drizzle / postgres dependencies — into the client bundle.

// Per-row TTL. Every write sets stale_after = NOW() + STALE_AFTER_TTL_MS.
// Matches the daily cron cadence in vercel.json ("0 11 * * *"). Drop to 1h
// when cron moves hourly in a future sub-version.
export const STALE_AFTER_TTL_MS = 24 * 60 * 60 * 1000;

// Postgres advisory-lock key for the bulk price refresh path. Arbitrary
// project-unique bigint. Convention if a second lock ever lands: high 32
// bits = feature namespace, low 32 bits = lock kind. Only one lock today,
// so the value is opaque. BigInt(...) call (vs an `n` literal) keeps the
// TS target at ES2017.
export const ADVISORY_LOCK_REFRESH_PRICES = BigInt(8273619012);
