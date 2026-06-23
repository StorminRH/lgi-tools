import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { BLUEPRINT_STRUCTURE_TAG, SDE_META_KEY_VERSION } from './constants';
import { eveDataMeta } from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

// Single key/value store for SDE pipeline bookkeeping (data version, tree hash).
// Shared by the request-path queries, the resolver, and the deploy/cron pipeline
// so they all read and write the same row through one implementation.

export async function getSdeMetaValue(db: AnyPgDb, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: eveDataMeta.value })
    .from(eveDataMeta)
    .where(eq(eveDataMeta.key, key))
    .limit(1);
  return row?.value ?? null;
}

// Cached, no-arg view of the ingested SDE build + when it landed, for the home
// dashboard's status card. Caching the read off the render path keeps it in the
// static shell; the SDE refresh cron busts BLUEPRINT_STRUCTURE_TAG, so a new
// build/ingest is reflected without waiting for a deploy.
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
    // value/updatedAt are NOT NULL, so a present row needs no per-field
    // coalescing — the only absent case is no row at all.
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
