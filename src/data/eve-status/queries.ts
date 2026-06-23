import { cacheLife, cacheTag } from 'next/cache';
import { EsiServerError, esiFetch, esiUrl } from '@/lib/esi';
import { ESI_STATUS_PATH, EVE_STATUS_TAG } from './constants';
import { parseServerStatus } from './parse';
import type { ServerStatus } from './types';

// Cached read of Tranquility's status (online player count + VIP flag) for the
// nav, fetched through the shared ESI gate. Like the EVE-news accessor, this
// THROWS on any failure rather than returning a sentinel: `'use cache'` caches
// the return value, so a caught "offline" would pin the nav offline for the
// whole window. By throwing, a failed background revalidation lets Next serve
// the last-good cached count (stale-while-revalidate); getNavServerStatus turns
// the cold-miss/outage throw into the offline state for display.
//
// Non-interactive (the gate's default): the dot is render-driven across every
// route, so it must fail closed and never claim the scarce interactive trickle.
// A 4xx returns a non-ok Response (we raise it as EsiServerError); 5xx/420/
// budget-refusal/timeout already throw inside the gate.
export async function getServerStatus(): Promise<
  Extract<ServerStatus, { players: number }>
> {
  'use cache';
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(EVE_STATUS_TAG);
  const res = await esiFetch(esiUrl(ESI_STATUS_PATH));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseServerStatus(await res.json());
}

// Non-throwing wrapper for the nav's Promise.all. A thrown status (cold miss,
// TQ downtime, ESI unreachable, budget exhausted) becomes the neutral offline
// state. Deliberately NOT cached — caching here would store the offline state
// and defeat the stale-while-revalidate contract above.
export async function getNavServerStatus(): Promise<ServerStatus> {
  try {
    return await getServerStatus();
  } catch {
    return { state: 'offline' };
  }
}
