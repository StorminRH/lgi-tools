import { cacheLife, cacheTag } from 'next/cache';
import { EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { ESI_STATUS_PATH, EVE_STATUS_TAG } from './constants';
import { parseServerStatus } from './parse';
import type { ServerStatus } from './types';

const LIVE_STATUS_CACHE = { stale: 30, revalidate: 60, expire: 300 };
const OFFLINE_STATUS_CACHE = { stale: 30, revalidate: 5, expire: 60 };

/**
 * Cached read of Tranquility's status (online player count + VIP flag) for the
 * nav, fetched through the shared ESI gate. Public and argument-free so
 * logged-in and logged-out visitors share one remote entry. The caller waits
 * on `connection()` so this fill never runs during prerender or prefetch.
 *
 * Failure becomes the neutral offline state INSIDE the cache boundary: an
 * error leaving `'use cache'` during a fill is stored as a digest and can
 * fail the deploy. Offline expire is under five minutes so a failed fill is
 * a dynamic hole, not a prerendered "TQ · offline" baked into the static
 * shell. Live expire stays at five minutes for the shared remote window.
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
