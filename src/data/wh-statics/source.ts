import 'server-only';

import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';

/**
 * Outcome of one conditional GET against the anoik.is statics feed. Failed
 * refreshes resolve to `unavailable` rather than throwing so serving can keep
 * reading the promoted copy.
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
  const headers: Record<string, string> = {
    'User-Agent': OUTBOUND_USER_AGENT,
  };
  if (knownEtag !== null) {
    headers['If-None-Match'] = knownEtag;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      WH_STATICS_FEED_URL,
      { headers },
      WH_STATICS_FETCH_TIMEOUT_MS,
    );
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'network error contacting anoik.is';
    return { status: 'unavailable', reason };
  }

  if (response.status === 304) {
    return { status: 'unchanged' };
  }

  if (response.status !== 200) {
    return {
      status: 'unavailable',
      reason: `anoik.is responded ${response.status} ${response.statusText}`,
    };
  }

  try {
    const body = await response.text();
    return {
      status: 'changed',
      body,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'failed to read anoik.is body';
    return { status: 'unavailable', reason };
  }
}
