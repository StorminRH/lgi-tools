import { cacheLife } from 'next/cache';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { ESI_STATUS_PATH } from './constants';
import { parseServerStatus } from './parse';
import type { SdeBuild, ServerStatus } from './types';

const LIVE_STATUS_CACHE = { stale: 30, revalidate: 60, expire: 300 };
const OFFLINE_STATUS_CACHE = { stale: 30, revalidate: 5, expire: 60 };
/** The pause before each retry; a read that never gets an answer stops after the last. */
const STATUS_RETRY_DELAYS_MS = [300, 900];
/** ESI's answer while Tranquility is down. */
const TRANQUILITY_UNAVAILABLE = 503;

/** One read of the server status, or null when ESI gave nothing to go on. */
async function readServerStatus(): Promise<ServerStatus | null> {
  try {
    const res = await esiFetch(esiUrl(ESI_STATUS_PATH));
    if (res.status === TRANQUILITY_UNAVAILABLE) return { state: 'offline' };
    if (!res.ok) return null;
    return parseServerStatus(await res.json());
  } catch (error) {
    if (error instanceof EsiServerError && error.status === TRANQUILITY_UNAVAILABLE) {
      return { state: 'offline' };
    }
    return null;
  }
}

/**
 * Tranquility's status. A timeout, a gateway error or a held-back call says
 * nothing about the server, so those are retried, and Tranquility is only
 * called offline when ESI says so.
 */
export async function getNavServerStatus(): Promise<ServerStatus> {
  'use cache: remote';
  let status = await readServerStatus();
  for (const delay of STATUS_RETRY_DELAYS_MS) {
    if (status !== null) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    status = await readServerStatus();
  }
  status ??= { state: 'unknown' };
  cacheLife(status.state === 'online' || status.state === 'vip' ? LIVE_STATUS_CACHE : OFFLINE_STATUS_CACHE);
  return status;
}

/** The SDE build LGI runs on, or null when none is recorded or the read fails. */
export async function getIngestedSdeBuild(): Promise<SdeBuild | null> {
  try {
    const { version, ingestedAt, latestPublished } = await getCachedSdeVersion();
    return version === null || ingestedAt === null
      ? null
      : { build: version, ingestedAt, latestPublished };
  } catch (error) {
    console.error('[eve-status] SDE version read failed', error);
    return null;
  }
}
