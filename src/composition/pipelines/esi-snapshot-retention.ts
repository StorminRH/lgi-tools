import { and, eq, exists, gt, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { esiSnapshots } from '@/data/esi-snapshots/schema';
import { ownedAssets } from '@/features/owned-assets/schema';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';

export function pruneEsiSnapshots(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
  deadline?: number,
): Promise<BatchedDeleteResult> {
  const cutoff = retentionCutoff(retentionDays, now);
  const newer = alias(esiSnapshots, 'newer_esi_snapshot');

  return deleteInBatches(
    database,
    esiSnapshots,
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
    deadline,
  );
}
