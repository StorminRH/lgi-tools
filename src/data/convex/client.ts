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

export const convexClient: ConvexReactClient | null = url ? new ConvexReactClient(url) : null;
