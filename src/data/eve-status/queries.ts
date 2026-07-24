import { cacheLife, cacheTag } from 'next/cache';
import { EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { ESI_STATUS_PATH, EVE_STATUS_TAG } from './constants';
import { parseServerStatus } from './parse';
import type { ServerStatus } from './types';

const LIVE_STATUS_CACHE = { stale: 30, revalidate: 60, expire: 300 };
const OFFLINE_STATUS_CACHE = { stale: 30, revalidate: 5, expire: 300 };

/**
 * Cached read of Tranquility's status (online player count + VIP flag) for the
 * nav, fetched through the shared ESI gate. Failure becomes the neutral offline
 * state INSIDE the cache boundary: Cache Components can fill this entry during
 * prerender, so letting a cold-miss error escape would make every static route's
 * build depend on the scoreboard being reachable. The failure entry revalidates
 * quickly, while expire stays at five minutes so the cache remains prerenderable.
 * The remote cache keeps that one result in storage shared across serverless
 * instances, reducing how often post-expiry refills consult the scoreboard and
 * ESI per instance; it does not guarantee concurrent cold misses coalesce.
 *
 * Non-interactive (the gate's default): the dot is render-driven across every
 * route, so it must fail closed and never claim the scarce interactive trickle.
 * A 4xx returns a non-ok Response (we raise it as EsiServerError); 5xx/420/
 * budget-refusal/timeout already throw inside the gate.
 */
export async function getNavServerStatus(): Promise<ServerStatus> {
  'use cache: remote';
  cacheTag(EVE_STATUS_TAG);
  let status: ServerStatus;
  try {
    const res = await esiFetch(esiUrl(ESI_STATUS_PATH));
    if (!res.ok) throw new EsiServerError(res.status);
    status = parseServerStatus(await res.json());
  } catch {
    status = { state: 'offline' };
  }
  cacheLife(status.state === 'offline' ? OFFLINE_STATUS_CACHE : LIVE_STATUS_CACHE);
  return status;
}
