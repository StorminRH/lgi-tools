import { SITE_URL } from '@/config/site-url';
import { logUsageEvent } from '@/data/telemetry/queries';
import { readEnv } from '@/lib/env';
import { forbiddenFailure, type AppFailure } from '@/lib/failure';

type OriginSource = 'origin' | 'referer';
export type SameOriginResult = { ok: true } | { ok: false; failure: AppFailure };

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

export function requireSameOrigin(request: Request): SameOriginResult {
  const origin = request.headers.get('origin');
  const referer = origin === null ? request.headers.get('referer') : null;
  const rawOrigin = origin ?? referer;
  if (rawOrigin === null) return { ok: true };

  const requestUrl = new URL(request.url);
  const source: OriginSource = origin === null ? 'referer' : 'origin';
  const normalizedOrigin = rawOrigin === 'null'
    ? 'null'
    : normalizeOrigin(rawOrigin);

  if (
    normalizedOrigin !== null
    && (normalizedOrigin === requestUrl.origin || normalizedOrigin === canonicalOrigin())
  ) return { ok: true };

  void logUsageEvent({
    action: 'cross_origin_mutation',
    metadata: {
      route: requestUrl.pathname,
      offendingOrigin: normalizedOrigin ?? 'invalid',
      source,
    },
  }).catch((error: unknown) => {
    console.error('[same-origin] telemetry write failed', error);
  });

  return {
    ok: false,
    failure: forbiddenFailure(
      'cross_origin',
      'Cross-origin requests are not allowed',
    ),
  };
}
