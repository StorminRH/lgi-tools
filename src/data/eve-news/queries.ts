import { cacheLife, cacheTag } from 'next/cache';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { EVE_NEWS_LIMIT, EVE_NEWS_RSS_URL, EVE_NEWS_TAG } from './constants';
import { parseEveRss } from './parse';
import type { EveNewsItem } from './types';

// Cached, best-effort read of EVE Online's news feed for the home dashboard.
// Deliberately NOT routed through the ESI gate — this is eveonline.com (a CMS
// RSS feed), not esi.evetech.net — so it neither needs nor should consume the
// shared per-IP ESI budget.
//
// On any failure (timeout, non-2xx, unparseable body) this THROWS rather than
// returning an empty list. That is the load-bearing choice: `'use cache'` caches
// the function's return value, so a caught `return []` would cache an empty list
// as a "success" and blank previously-good news for the whole cacheLife window.
// By throwing, a failed background revalidation lets Next serve the last-good
// cached value (stale-while-revalidate); the consumer (HomeNewsCard) catches the
// cold-miss case and renders an empty state, so the page never errors. CCP being
// down during `next build` just yields an empty card that self-heals on the next
// successful revalidation.
export async function getEveNews(): Promise<EveNewsItem[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(EVE_NEWS_TAG);
  const res = await fetchWithTimeout(EVE_NEWS_RSS_URL, {
    headers: { accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`eve news: HTTP ${res.status}`);
  return parseEveRss(await res.text()).slice(0, EVE_NEWS_LIMIT);
}
