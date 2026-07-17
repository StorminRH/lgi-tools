/**
 * Canonical public origin. Used by the global metadata, generateMetadata
 * on dynamic routes, the sitemap, and robots.txt — everything that needs
 * to emit an absolute URL. Override via NEXT_PUBLIC_SITE_URL in Vercel
 * (Production + Preview) when a different domain is desired; falls back
 * to the production domain so unconfigured environments still produce
 * usable output.
 */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lgi.tools';
