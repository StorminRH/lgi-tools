import { fenceMapAccessProjection } from '@/composition/map-access-projection';
import { purgeMapChainDoor } from '@/data/maps/convex-doors';
import {
  claimPurgeableMaps,
  tombstoneOwnedMaps,
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
 * Fences the map with an empty projection before its chain is purged. The
 * purge keeps the watermark the fence leaves, so no projection reserved before
 * the fence can land afterwards and re-grant the erased map.
 */
async function fenceMapAccess(
  mapId: string,
  fenceAccess: typeof fenceMapAccessProjection = fenceMapAccessProjection,
): Promise<void> {
  try {
    await fenceAccess(mapId);
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
 * carries no claims. Each map is then fenced and its chain purged, one map at
 * a time so each call stays inside Convex's batch limits. The first failure
 * stops the run; the rows stay listed, so the caller's retry repeats every
 * step.
 */
export async function purgeOwnedMapChains(userId: string): Promise<string[]> {
  await tombstoneOwnedMaps(userId);
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await fenceMapAccess(mapId);
    await purgeMapChain(mapId);
  }
  return ownedMapIds;
}

export interface MapPurgeDependencies {
  readonly claimMaps?: typeof claimPurgeableMaps;
  readonly purgeChain?: typeof purgeMapChain;
  readonly tombstoneMap?: typeof tombstonePurgedMap;
  readonly fenceAccess?: typeof fenceMapAccessProjection;
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
  const fenceAccess = dependencies.fenceAccess ?? fenceMapAccessProjection;
  const due = await claimMaps();
  let tombstoned = 0;
  let deletedDocuments = 0;

  for (const map of due) {
    if (Date.now() >= deadline) break;
    await fenceMapAccess(map.id, fenceAccess);
    const purge = await purgeChain(map.id);
    if (purge.remaining) {
      throw new MapPurgeUnavailableError(
        `Map purge did not finish for ${map.id}`,
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
