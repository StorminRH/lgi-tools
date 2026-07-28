import 'server-only';

import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';

/** Result of one conditional community-feed request. */
export type StaticsFeedResult =
  | { readonly status: 'unchanged' }
  | {
      readonly status: 'changed';
      readonly body: string;
      readonly etag: string | null;
      readonly lastModified: string | null;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

/**
 * Asks anoik.is whether the statics feed changed since `knownEtag`, returning the
 * new body only when it did. An unreachable or erroring feed resolves to
 * `unavailable` because refresh failure must not affect the promoted serving copy.
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
        reason: `anoik.is returned HTTP ${response.status}`,
      };
    }
    return {
      status: 'changed',
      body: await response.text(),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error
          ? `anoik.is request failed: ${error.message}`
          : 'anoik.is request failed',
    };
  }
}
