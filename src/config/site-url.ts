/**
 * Canonical public origin. Used by the global metadata, generateMetadata
 * on dynamic routes, the sitemap, and robots.txt. Everything that needs
 * to emit an absolute URL. Override via NEXT_PUBLIC_SITE_URL in Vercel
 * (Production + Preview) when a different domain is desired. Falls back
 * to the production domain so unconfigured environments still produce
 * usable output.
 *
 * Staging Preview sets NEXT_PUBLIC_SITE_URL to STAGING_SITE_URL so EVE SSO,
 * Better Auth, and Convex issuer stay on that durable host, not a
 * per-deployment `*.vercel.app` URL. If that env is missing, a staging
 * Vercel build still resolves here instead of lgi.tools.
 */
export const PRODUCTION_SITE_URL = 'https://lgi.tools';
export const STAGING_SITE_URL = 'https://staging.lgi.tools';

export type SiteUrlEnv = {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_TARGET_ENV?: string;
  LGI_PREVIEW_LINE?: string;
};

export function resolveSiteUrl(env: SiteUrlEnv): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL;
  if (
    env.VERCEL_GIT_COMMIT_REF === 'staging' ||
    env.VERCEL_TARGET_ENV === 'staging' ||
    env.LGI_PREVIEW_LINE === 'staging'
  ) {
    return STAGING_SITE_URL;
  }
  return PRODUCTION_SITE_URL;
}

export const SITE_URL: string = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  LGI_PREVIEW_LINE: process.env.LGI_PREVIEW_LINE,
});
