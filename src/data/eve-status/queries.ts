import { cacheLife, cacheTag } from 'next/cache';
import { EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { ESI_STATUS_PATH, EVE_STATUS_TAG } from './constants';
import { parseServerStatus } from './parse';
import type { ServerStatus } from './types';

const LIVE_STATUS_CACHE = { stale: 30, revalidate: 60, expire: 300 };
const OFFLINE_STATUS_CACHE = { stale: 30, revalidate: 5, expire: 60 };

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
