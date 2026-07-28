import 'server-only';

import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';

/** Result of asking anoik.is whether its statics feed changed. */
export type StaticsFeedResult =
  | { status: 'unchanged' }
  | {
      status: 'changed';
      body: string;
      etag: string | null;
      lastModified: string | null;
    }
  | { status: 'unavailable'; reason: string };

function unavailableReason(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown anoik.is fetch failure';
}

/**
 * Asks anoik.is whether the statics feed changed since `knownEtag`, returning the
 * new body only when it did. An unreachable or erroring feed resolves to
 * `unavailable` rather than throwing, because a failed refresh must never affect
 * the promoted copy that serving reads.
 */
export async function fetchStaticsFeed(
  knownEtag: string | null,
): Promise<StaticsFeedResult> {
  const headers = new Headers({ 'User-Agent': OUTBOUND_USER_AGENT });
  if (knownEtag !== null) headers.set('If-None-Match', knownEtag);

  try {
    const response = await fetchWithTimeout(
      WH_STATICS_FEED_URL,
      { headers },
      WH_STATICS_FETCH_TIMEOUT_MS,
    );
    if (response.status === 304) return { status: 'unchanged' };
    if (response.status !== 200) {
      return {
        status: 'unavailable',
        reason: `anoik.is returned ${response.status} ${response.statusText}`.trim(),
      };
    }
    return {
      status: 'changed',
      body: await response.text(),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  } catch (error) {
    return { status: 'unavailable', reason: unavailableReason(error) };
  }
}
