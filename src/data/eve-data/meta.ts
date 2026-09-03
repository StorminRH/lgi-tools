import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { BLUEPRINT_STRUCTURE_TAG, SDE_META_KEY_VERSION } from './constants';
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

export async function getCachedSdeVersion(): Promise<{
  version: string | null;
  ingestedAt: Date | null;
}> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const [row] = await db
      .select({ value: eveDataMeta.value, updatedAt: eveDataMeta.updatedAt })
      .from(eveDataMeta)
      .where(eq(eveDataMeta.key, SDE_META_KEY_VERSION))
      .limit(1);

    if (!row) return { version: null, ingestedAt: null };
    return { version: row.value, ingestedAt: row.updatedAt };
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
