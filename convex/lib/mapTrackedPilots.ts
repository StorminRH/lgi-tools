import type { QueryCtx } from '../_generated/server';
import { uniqueByUserCharacter } from './indexedQuery';
import { readMapTracking } from './mapTrackingCapacity';

/** The solar systems holding a pilot tracked on the map. Throws TRACKING_SCAN_LIMIT past the map cap. */
async function readTrackedPilotSystemIds(
  ctx: QueryCtx,
  mapId: string,
): Promise<ReadonlySet<number>> {
  const rows = await readMapTracking(ctx, mapId);
  const locations = await Promise.all(
    rows.map((row) => uniqueByUserCharacter(ctx, 'characterLocation', row.userId, row.characterId)),
  );
  const systemIds = new Set<number>();
  for (const location of locations) {
    if (location !== null) systemIds.add(location.solarSystemId);
  }
  return systemIds;
}

/** The systems holding a tracked pilot on one map. */
export type TrackedPilotSystems = (mapId: string) => Promise<ReadonlySet<number>>;

/**
 * Tracked-pilot systems per map, read on the first call for each map and then
 * held for the rest of the transaction. Collapses and settlements never write
 * characterLocation, so the held set stays current. Only settled values are
 * held: a TRACKING_SCAN_LIMIT throw is raised again on the next call.
 */
export function trackedPilotSystemsByMap(ctx: QueryCtx): TrackedPilotSystems {
  const held = new Map<string, ReadonlySet<number>>();
  return async (mapId) => {
    const cached = held.get(mapId);
    if (cached !== undefined) return cached;
    const tracked = await readTrackedPilotSystemIds(ctx, mapId);
    held.set(mapId, tracked);
    return tracked;
  };
}
