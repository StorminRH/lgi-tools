import { readEnv } from '@/lib/env';

// Dev-only escape hatch for previewing the UI without a database.
//
// Several prerender-reachable accessors (the home status card, the header's
// site-search index) read from Neon. In a local sandbox or design-preview where
// DATABASE_URL isn't wired up, those reads throw and 500 every route — which
// makes it impossible to review styling/layout work.
//
// `devDbFallback` lets such an accessor hand back a safe placeholder INSTEAD of
// hitting the DB, but ONLY when all of these hold:
//   - not a production runtime (`NODE_ENV`), and
//   - not a production Vercel environment (`VERCEL_ENV`), and
//   - DATABASE_URL is genuinely absent.
// The moment a real connection string is present — or we're in production — it
// returns `undefined` and the caller takes its normal DB path. So this can
// never mask a real outage or alter production output; it is inert wherever a
// database actually exists.
export function isDblessDevEnv(): boolean {
  // NODE_ENV is statically inlined by the bundler (see lib/env.ts) — read direct.
  if (process.env.NODE_ENV === 'production') return false;
  if (readEnv('VERCEL_ENV') === 'production') return false;
  return !readEnv('DATABASE_URL');
}

// Returns `value` only in a DB-less dev environment, otherwise `undefined` so
// the caller falls through to its real database read:
//
//   const fallback = devDbFallback(69);
//   if (fallback !== undefined) return fallback;
//   return withColdStartRetry(() => db.select(...));
export function devDbFallback<T>(value: T): T | undefined {
  return isDblessDevEnv() ? value : undefined;
}
