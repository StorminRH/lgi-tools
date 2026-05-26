// Shared constants for the market-prices slice. Lives in its own module so
// that client components (like the PriceFreshness nav chip) can import them
// without pulling the server-only cache.ts / ingest.ts modules — and their
// drizzle / postgres dependencies — into the client bundle.

export const CACHE_TTL_MS = 60 * 60 * 1000;
