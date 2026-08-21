/**
 * Canonical public origin. Used by the global metadata, generateMetadata
 * on dynamic routes, the sitemap, and robots.txt. Everything that needs
 * to emit an absolute URL. Override via NEXT_PUBLIC_SITE_URL in Vercel
 * (Production + Preview) when a different domain is desired. Falls back
 * to the production domain so unconfigured environments still produce
 * usable output.
 *
 * Staging Preview sets NEXT_PUBLIC_SITE_URL to https://staging.lgi.tools
 * so EVE SSO, Better Auth, and Convex issuer stay on that durable host,
 * not a per-deployment `*.vercel.app` URL.
 */
export const PRODUCTION_SITE_URL = 'https://lgi.tools';

export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_SITE_URL;
