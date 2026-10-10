import { gt, sql, type SQL } from 'drizzle-orm';
import { MAP_DELETE_GRACE_MS } from './lifecycle-contract';
import { maps } from './schema';

/** A live map: neither deleted into its grace period nor purged. */
export function activeMapCondition(): SQL {
  return sql`(${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL)`;
}

/**
 * A deleted map still strictly inside its grace period, with no purge requested,
 * claimed or done. The purge sweep takes the complement: archived at or before
 * the same cutoff.
 */
export function restorableMapCondition(now: Date): SQL {
  const graceCutoff = new Date(now.getTime() - MAP_DELETE_GRACE_MS);
  return sql`(${maps.archivedAt} IS NOT NULL
    AND ${gt(maps.archivedAt, graceCutoff)}
    AND ${maps.purgeRequestedAt} IS NULL
    AND ${maps.purgeClaimedAt} IS NULL
    AND ${maps.tombstonedAt} IS NULL)`;
}
