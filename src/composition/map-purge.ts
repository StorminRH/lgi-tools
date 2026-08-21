import { z } from 'zod';
import {
  requireCurrentProjection,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import {
  claimPurgeableMaps,
  tombstonePurgedMap,
} from '@/data/maps/lifecycle';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const mapPurgeResponseSchema = z.strictObject({
  deleted: z.number().int().nonnegative(),
  remaining: z.literal(false),
});

/** Thrown when the collaborative purge cannot prove a clean terminal state. */
export class MapPurgeUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MapPurgeUnavailableError';
  }
}

/** Drives the bearer-gated bounded Convex purge door for exactly one map. */
export async function purgeMapChain(
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

export interface MapPurgeDependencies {
  readonly claimMaps?: typeof claimPurgeableMaps;
  readonly purgeChain?: typeof purgeMapChain;
  readonly tombstoneMap?: typeof tombstonePurgedMap;
  readonly teardownAccess?: typeof teardownMapAccessProjection;
}

/**
 * Purges one bounded due-map set. Each row is tombstoned only after the
 * collaborative door proves no map-keyed rows remain and an empty-claim
 * projection fence is current.
 */
export async function purgeEligibleMaps(
  dependencies: MapPurgeDependencies = {},
): Promise<{
  readonly selected: number;
  readonly tombstoned: number;
  readonly deletedDocuments: number;
  readonly projectionPending: number;
}> {
  const claimMaps = dependencies.claimMaps ?? claimPurgeableMaps;
  const purgeChain = dependencies.purgeChain ?? purgeMapChain;
  const tombstoneMap = dependencies.tombstoneMap ?? tombstonePurgedMap;
  const teardownAccess = dependencies.teardownAccess ?? teardownMapAccessProjection;
  const due = await claimMaps();
  let tombstoned = 0;
  let deletedDocuments = 0;
  const projectionPending = 0;

  for (const map of due) {
    const purge = await purgeChain(map.id);
    if (purge.remaining) {
      throw new MapPurgeUnavailableError(
        `Map purge did not finish for ${map.id}`,
      );
    }
    try {
      requireCurrentProjection(await teardownAccess(map.id));
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
  return { selected: due.length, tombstoned, deletedDocuments, projectionPending };
}
