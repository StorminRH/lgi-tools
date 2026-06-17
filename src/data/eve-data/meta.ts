import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
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

export async function setSdeMetaValue(db: AnyPgDb, key: string, value: string): Promise<void> {
  await db
    .insert(eveDataMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eveDataMeta.key,
      set: { value, updatedAt: new Date() },
    });
}
