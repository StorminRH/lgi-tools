import { z } from 'zod';
import { teardownMapAccessProjection } from '@/composition/map-access-projection';
import {
  claimPurgeableMaps,
  tombstoneOwnedMaps,
  tombstonePurgedMap,
} from '@/data/maps/lifecycle';
import { getOwnedMapIds } from '@/data/maps/queries';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const MAP_PURGE_WORK_BUDGET_MS = 60_000;

const mapPurgeResponseSchema = z.strictObject({
  deleted: z.number().int().nonnegative(),
  remaining: z.literal(false),
});

export class MapPurgeUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MapPurgeUnavailableError';
  }
}

async function purgeMapChain(
  mapId: string,
): Promise<{ readonly deleted: number; readonly remaining: false }> {
  return postConvexHttpDoor({
    path: '/purge-map-chain',
    body: { mapId },
    schema: mapPurgeResponseSchema,
    error: MapPurgeUnavailableError,
    label: 'Map purge unavailable',
  });
}

/**
 * An empty projection at a fresh revision. The chain purge deletes the map's
 * projection watermark, which leaves Convex accepting any revision; the fence
 * restores one above every projection reserved before it.
 */
async function fenceMapAccess(
  mapId: string,
  teardownAccess: typeof teardownMapAccessProjection = teardownMapAccessProjection,
): Promise<void> {
  try {
    await teardownAccess(mapId);
  } catch (cause) {
    throw new MapPurgeUnavailableError(
      `Map access projection fence failed for ${mapId}`,
      { cause },
    );
  }
}

/**
 * Erases every map the user owns for an account deletion and returns their
 * ids. The maps are tombstoned first, so any projection computed from then on
 * carries no claims. Each chain is then purged, one map at a time so each call
 * stays inside Convex's batch limits, and fenced at once: a projection computed
 * before the tombstone that lands after the purge is either wiped by the fence
 * or refused as stale, instead of re-granting access to the erased map. The
 * first failure stops the run; the rows stay listed, so the caller's retry
 * repeats every step.
 */
export async function purgeOwnedMapChains(userId: string): Promise<string[]> {
  await tombstoneOwnedMaps(userId);
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await purgeMapChain(mapId);
    await fenceMapAccess(mapId);
  }
  return ownedMapIds;
}

export interface MapPurgeDependencies {
  readonly claimMaps?: typeof claimPurgeableMaps;
  readonly purgeChain?: typeof purgeMapChain;
  readonly tombstoneMap?: typeof tombstonePurgedMap;
  readonly teardownAccess?: typeof teardownMapAccessProjection;
}

export async function purgeEligibleMaps(
  dependencies: MapPurgeDependencies = {},
): Promise<{
  readonly selected: number;
  readonly tombstoned: number;
  readonly deletedDocuments: number;
}> {
  const deadline = Date.now() + MAP_PURGE_WORK_BUDGET_MS;
  const claimMaps = dependencies.claimMaps ?? claimPurgeableMaps;
  const purgeChain = dependencies.purgeChain ?? purgeMapChain;
  const tombstoneMap = dependencies.tombstoneMap ?? tombstonePurgedMap;
  const teardownAccess = dependencies.teardownAccess ?? teardownMapAccessProjection;
  const due = await claimMaps();
  let tombstoned = 0;
  let deletedDocuments = 0;

  for (const map of due) {
    if (Date.now() >= deadline) break;
    const purge = await purgeChain(map.id);
    if (purge.remaining) {
      throw new MapPurgeUnavailableError(
        `Map purge did not finish for ${map.id}`,
      );
    }
    await fenceMapAccess(map.id, teardownAccess);
    const marked = await tombstoneMap(map.id);
    if (!marked) {
      throw new MapPurgeUnavailableError(
        `Map ${map.id} changed lifecycle state before tombstone`,
      );
    }
    tombstoned += 1;
    deletedDocuments += purge.deleted;
  }
  return { selected: due.length, tombstoned, deletedDocuments };
}
