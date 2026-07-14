import { SITE_URL } from '@/config/site-url';
import { logUsageEvent } from '@/data/telemetry/queries';
import { readEnv } from '@/lib/env';

type OriginSource = 'origin' | 'referer';

function normalizeOrigin(value: string, addHttps = false): string | null {
  try {
    return new URL(addHttps && !value.includes('://') ? `https://${value}` : value).origin;
  } catch {
    return null;
  }
}

function canonicalOrigin(): string {
  if (readEnv('VERCEL_ENV') === 'preview') {
    const deploymentUrl = readEnv('VERCEL_URL');
    const previewOrigin = deploymentUrl
      ? normalizeOrigin(deploymentUrl, true)
      : null;
    if (previewOrigin) return previewOrigin;
  }

  const authOrigin = readEnv('BETTER_AUTH_URL');
  return (authOrigin ? normalizeOrigin(authOrigin) : null)
    ?? normalizeOrigin(SITE_URL)
    ?? 'https://lgi.tools';
}

/**
 * Observes cross-origin browser mutations without changing their response.
 * Authentication and rate-limit gates remain the caller's responsibility.
 */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const referer = origin === null ? request.headers.get('referer') : null;
  const rawOrigin = origin ?? referer;
  if (rawOrigin === null) return;

  const source: OriginSource = origin === null ? 'referer' : 'origin';
  const normalizedOrigin = rawOrigin === 'null'
    ? 'null'
    : normalizeOrigin(rawOrigin);

  if (normalizedOrigin !== null && normalizedOrigin === canonicalOrigin()) return;

  void logUsageEvent({
    action: 'cross_origin_mutation',
    metadata: {
      route: new URL(request.url).pathname,
      offendingOrigin: normalizedOrigin ?? 'invalid',
      source,
    },
  }).catch((error: unknown) => {
    console.error('[same-origin] telemetry write failed', error);
  });
}
