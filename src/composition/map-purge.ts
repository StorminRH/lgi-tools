import { teardownMapAccessProjection } from '@/composition/map-access-projection';
import { purgeMapChainDoor } from '@/data/maps/convex-doors';
import {
  claimPurgeableMaps,
  tombstonePurgedMap,
} from '@/data/maps/lifecycle';
import { getOwnedMapIds } from '@/data/maps/queries';
import type { ConvexDoorResponse } from '@/lib/convex-door-contract';
import { ConvexDoorError, postConvexHttpDoor } from '@/lib/convex-http-door';

const MAP_PURGE_WORK_BUDGET_MS = 60_000;

export class MapPurgeUnavailableError extends ConvexDoorError {
  override readonly name = 'MapPurgeUnavailableError';
}

async function purgeMapChain(
  mapId: string,
): Promise<ConvexDoorResponse<typeof purgeMapChainDoor>> {
  return postConvexHttpDoor(purgeMapChainDoor, { mapId }, {
    error: MapPurgeUnavailableError,
    label: 'Map purge unavailable',
  });
}

/**
 * Purges the Convex chain of every map the user owns, one map at a time so
 * each call stays inside Convex's batch limits, and returns the purged ids.
 * The first failure stops the run; the caller keeps the deletion retryable.
 */
export async function purgeOwnedMapChains(userId: string): Promise<string[]> {
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await purgeMapChain(mapId);
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
    try {
      await teardownAccess(map.id);
    } catch (cause) {
      throw new MapPurgeUnavailableError(
        `Map access projection fence failed for ${map.id}`,
        { cause },
      );
    }
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
