import { ConvexReactClient } from 'convex/react';

// The browser-side Convex client singleton (3.4.3). NEXT_PUBLIC_CONVEX_URL is
// a literal static read by design: Next inlines it into every bundle at build
// time, and on Vercel the value exists ONLY in the build env — `npx convex
// deploy --cmd-url-env-var-name` injects each deployment's exact backend URL
// (prod, or the per-branch preview backend). Locally `npx convex dev` writes
// it to .env.local. When unset (a contributor without Convex), the client is
// null and every consumer degrades gracefully — the rest of the site runs.
// Construction is connection-free; the client connects on first subscription.
const url = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Console logger that never touches Convex's DefaultLogger listener registry.
 *
 * Next.js Cache Components prerenders Client Component modules on the server.
 * `new ConvexReactClient()` with the default logger calls `Math.random()` inside
 * `DefaultLogger.addLogLineListener`, which surfaces as
 * `next-prerender-random-client` on `/atlas` (and every other route under the
 * root layout). A plain logger keeps Convex console output without that
 * non-deterministic SSR path. Shape matches Convex's public `Logger` contract.
 */
const consoleLogger = {
  logVerbose(...args: unknown[]) {
    console.debug(...args);
  },
  log(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
};

/**
 * Shared browser Convex client configured from the public deployment URL; null disables live reads
 * when the URL is absent.
 */
export const convexClient: ConvexReactClient | null = url
  ? new ConvexReactClient(url, { logger: consoleLogger })
  : null;
