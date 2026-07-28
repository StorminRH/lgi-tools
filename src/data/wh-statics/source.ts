import 'server-only';

import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';

/**
 * Result of asking anoik.is whether the statics feed changed. Never throws to
 * its caller: an unreachable or erroring feed resolves to `unavailable`.
 */
export type StaticsFeedResult =
  | { status: 'unchanged' }
  | {
      status: 'changed';
      body: string;
      etag: string | null;
      lastModified: string | null;
    }
  | { status: 'unavailable'; reason: string };

/**
 * Asks anoik.is whether the statics feed changed since `knownEtag`, returning the
 * new body only when it did. An unreachable or erroring feed resolves to
 * `unavailable` rather than throwing, because a failed refresh must never affect
 * the promoted copy that serving reads.
 */
export async function fetchStaticsFeed(
  knownEtag: string | null,
): Promise<StaticsFeedResult> {
  const headers = new Headers({
    'User-Agent': OUTBOUND_USER_AGENT,
    Accept: 'application/json',
  });
  if (knownEtag !== null) {
    headers.set('If-None-Match', knownEtag);
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      WH_STATICS_FEED_URL,
      { headers },
      WH_STATICS_FETCH_TIMEOUT_MS,
    );
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'unknown network error';
    return { status: 'unavailable', reason };
  }

  if (res.status === 304) {
    return { status: 'unchanged' };
  }

  if (res.status !== 200) {
    return {
      status: 'unavailable',
      reason: `HTTP ${res.status} ${res.statusText}`.trim(),
    };
  }

  try {
    const body = await res.text();
    return {
      status: 'changed',
      body,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'failed to read response body';
    return { status: 'unavailable', reason };
  }
}
