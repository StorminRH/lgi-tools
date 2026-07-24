import { and, eq, exists, gt, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { esiSnapshots } from '@/data/esi-snapshots/schema';
import { ownedAssets } from '@/features/owned-assets/schema';
import type { AnyPgDb } from '@/lib/db-types';

/**
 * Deletes expired unreferenced ESI snapshots while retaining the newest snapshot and any snapshot
 * still referenced by current data.
 */
export async function pruneEsiSnapshots(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const newer = alias(esiSnapshots, 'newer_esi_snapshot');

  await database.delete(esiSnapshots).where(
    and(
      lt(esiSnapshots.fetchedAt, cutoff),
      exists(
        database
          .select({ one: sql`1` })
          .from(newer)
          .where(
            and(
              eq(newer.ownerType, esiSnapshots.ownerType),
              eq(newer.ownerId, esiSnapshots.ownerId),
              eq(newer.endpoint, esiSnapshots.endpoint),
              or(
                gt(newer.fetchedAt, esiSnapshots.fetchedAt),
                and(eq(newer.fetchedAt, esiSnapshots.fetchedAt), gt(newer.id, esiSnapshots.id)),
              ),
            ),
          ),
      ),
      notExists(
        database
          .select({ one: sql`1` })
          .from(ownedAssets)
          .where(eq(ownedAssets.snapshotId, esiSnapshots.id)),
      ),
    ),
  );
}
