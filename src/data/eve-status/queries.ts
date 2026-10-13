import { cacheLife, cacheTag } from 'next/cache';
import { storedRow, STATUS_KEY, untilExpires } from '@/data/esi-store';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { eveTag } from '@/lib/esi-datasets/routes';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { statusRecordOf } from './record';
import type { SdeBuild, ServerStatus } from './types';

export interface StoredServerStatus {
  readonly status: ServerStatus;
  /** When CCP's copy expires, in epoch ms; null when nothing is stored yet. */
  readonly expiresAt: number | null;
}

/**
 * Tranquility's status as stored in its `/status/` row, cached until CCP's
 * Expires. Nothing is called here: the uncached caller compares the
 * expiry with now and refreshes behind the response when it has passed.
 */
export async function getNavServerStatus(): Promise<StoredServerStatus> {
  'use cache: remote';
  cacheTag(eveTag('eve_status'));
  const row = await withColdStartRetry(() => storedRow(STATUS_KEY));
  const expiresAt = row?.expiresAt ?? null;
  cacheLife(untilExpires(expiresAt));
  return { status: statusRecordOf(row?.body).status, expiresAt };
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
