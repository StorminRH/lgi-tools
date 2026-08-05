import { cacheLife, cacheTag } from 'next/cache';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { EVE_NEWS_LIMIT, EVE_NEWS_RSS_URL, EVE_NEWS_TAG } from './constants';
import { parseEveRss } from './parse';
import type { EveNewsItem } from './types';

// An empty result (feed failure, or a genuinely empty feed) revalidates within
// minutes so the card self-heals fast; a healthy read keeps the sub-day
// 'hours' profile inline below (cacheLife's string and object overloads don't
// union, so the two branches stay separate calls).
const EMPTY_NEWS_CACHE = { stale: 30, revalidate: 300, expire: 3600 };

/**
 * Cached, best-effort read of EVE Online's news feed for the home dashboard.
 * Deliberately NOT routed through the ESI gate — this is eveonline.com (a CMS
 * RSS feed), not esi.evetech.net — so it neither needs nor should consume the
 * shared per-IP ESI budget.
 *
 * Failure (timeout, non-2xx, unparseable body) becomes an EMPTY LIST inside the
 * cache boundary, mirroring getNavServerStatus. That is the load-bearing
 * choice: under Cache Components, an error crossing a `'use cache'` boundary
 * during build prerender lands in Next's react-server digest map and fails the
 * whole deploy — even when the consumer catches it — so the home page's build
 * must never depend on eveonline.com answering. The cost is that a failed
 * revalidation caches the empty list over last-good news; the short
 * EMPTY_NEWS_CACHE profile bounds that blank window to minutes.
 */
export async function getEveNews(): Promise<EveNewsItem[]> {
  'use cache';
  cacheTag(EVE_NEWS_TAG);
  let items: EveNewsItem[];
  try {
    const res = await fetchWithTimeout(EVE_NEWS_RSS_URL, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
    });
    if (!res.ok) throw new Error(`eve news: HTTP ${res.status}`);
    items = parseEveRss(await res.text()).slice(0, EVE_NEWS_LIMIT);
  } catch {
    items = [];
  }
  if (items.length === 0) cacheLife(EMPTY_NEWS_CACHE);
  else cacheLife('hours');
  return items;
}
