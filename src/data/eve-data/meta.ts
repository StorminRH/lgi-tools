import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import {
  SDE_CACHE_TAG,
  SDE_META_KEY_LATEST_PUBLISHED,
  SDE_META_KEY_VERSION,
  SDE_VERSION_CACHE_TAG,
} from './constants';
import { eveDataMeta } from './schema';
import type { AnyPgDb } from '@/lib/db-types';

export async function getSdeMetaValue(db: AnyPgDb, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: eveDataMeta.value })
    .from(eveDataMeta)
    .where(eq(eveDataMeta.key, key))
    .limit(1);
  return row?.value ?? null;
}

/**
 * The SDE build LGI has ingested and when, plus the newest build CCP had
 * published when the cron last checked, so a reader can tell the two apart.
 */
export async function getCachedSdeVersion(): Promise<{
  version: string | null;
  ingestedAt: Date | null;
  latestPublished: string | null;
}> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG, SDE_VERSION_CACHE_TAG);
  return withColdStartRetry(async () => {
    const rows = await db
      .select({ key: eveDataMeta.key, value: eveDataMeta.value, updatedAt: eveDataMeta.updatedAt })
      .from(eveDataMeta)
      .where(inArray(eveDataMeta.key, [SDE_META_KEY_VERSION, SDE_META_KEY_LATEST_PUBLISHED]));
    const ingested = rows.find((row) => row.key === SDE_META_KEY_VERSION);
    const latest = rows.find((row) => row.key === SDE_META_KEY_LATEST_PUBLISHED);
    return {
      version: ingested?.value ?? null,
      ingestedAt: ingested?.updatedAt ?? null,
      latestPublished: latest?.value ?? null,
    };
  });
}

export async function setSdeMetaValue(db: AnyPgDb, key: string, value: string): Promise<void> {
  await db
    .insert(eveDataMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eveDataMeta.key,
      set: { value, updatedAt: new Date() },
    });
}
