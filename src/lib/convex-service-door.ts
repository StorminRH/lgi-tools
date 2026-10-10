import { publicConvexUrl } from '@/config/public-env';
import { readEnv } from '@/lib/env';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import { isLocalUrl } from '@/lib/url-safety';

export function resolveConvexServiceDoor():
  | { readonly ok: true; readonly siteUrl: string; readonly secret: string }
  | { readonly ok: false; readonly reason: 'convex_not_configured' | 'unrecognized_convex_url' | 'service_secret_missing' } {
  const convexUrl = publicConvexUrl();
  if (convexUrl === undefined) return { ok: false, reason: 'convex_not_configured' };
  const siteUrl = deriveConvexSiteUrl(convexUrl);
  if (siteUrl === null || !isSafeServiceUrl(siteUrl)) {
    return { ok: false, reason: 'unrecognized_convex_url' };
  }
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  if (!secret) return { ok: false, reason: 'service_secret_missing' };
  return { ok: true, siteUrl, secret };
}

function isSafeServiceUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' || isLocalUrl(value, ['http:']);
  } catch {
    return false;
  }
}
