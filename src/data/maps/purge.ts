import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bestEffort } from '@/lib/best-effort';
import type { PurgeContributor } from '@/platform/purge/types';
import {
  getCharacterCorporationId,
  getMapIdsWithCharacterGrant,
  getMapIdsWithCorporationGrants,
  getOwnedMapIds,
} from './queries';
import { mapAccess, maps } from './schema';

/**
 * Composition-owned Convex side-effects for maps purge. Composition registers
 * these because the data slice cannot import composition under Fallow. Whole-map
 * chain purge is required before Neon identity deletion; claim reconciliation
 * remains best effort after other durable credential changes.
 */
export interface MapAccessProjectionPurgeHooks {
  readonly projectMap: (mapId: string) => Promise<void>;
  readonly purgeMapChain: (mapId: string) => Promise<void>;
  readonly purgeUserClaims: (userId: string) => Promise<void>;
}

let projectionHooks: MapAccessProjectionPurgeHooks | null = null;

/**
 * Registers the composition-owned Convex projection side-effects for maps purge.
 * Call once from the purge wiring manifest before any purge runs.
 */
export function registerMapAccessProjectionPurgeHooks(
  hooks: MapAccessProjectionPurgeHooks,
): void {
  projectionHooks = hooks;
}

/** Deletes every direct character grant for one character id. */
export async function deleteCharacterMapGrants(characterId: number): Promise<void> {
  await db
    .delete(mapAccess)
    .where(
      and(
        eq(mapAccess.ownerType, 'character'),
        eq(mapAccess.ownerId, characterId),
      ),
    );
}

/** Deletes every map owned by one user (grants cascade with the map rows). */
export async function deleteOwnedMaps(userId: string): Promise<void> {
  await db.delete(maps).where(eq(maps.userId, userId));
}

/**
 * Credential-tier teardown for durable map access. Character transfer destroys direct grants
 * before the character can resolve under a new human; whole-user purge deletes owned maps and
 * their cascading grants. Whole-user purge first removes each owned collaborative
 * chain through the required bearer door so a failed purge remains retryable;
 * other projection reconciliation stays best effort.
 */
export const mapsPurgeContributor: PurgeContributor = {
  name: 'maps',
  tier: 'credential',
  claims: [maps, mapAccess],
  async purgeCharacter({ characterId }) {
    const corporationId = await getCharacterCorporationId(characterId);
    const characterMaps = await getMapIdsWithCharacterGrant(characterId);
    const corporationMaps =
      corporationId === null
        ? []
        : await getMapIdsWithCorporationGrants([corporationId]);
    const affectedMapIds = [...new Set([...characterMaps, ...corporationMaps])];

    await deleteCharacterMapGrants(characterId);

    const hooks = projectionHooks;
    for (const mapId of affectedMapIds) {
      await bestEffort(
        'maps/purge',
        'projection',
        mapId,
        hooks ? () => hooks.projectMap(mapId) : undefined,
      );
    }
  },
  async purgeUser({ userId }) {
    const ownedMapIds = await getOwnedMapIds(userId);
    const hooks = projectionHooks;
    if (ownedMapIds.length > 0 && hooks === null) {
      throw new Error('Map chain purge hook is not registered');
    }
    // Collaborative chain rows are primary user-authored data. Purge them
    // before deleting their Neon map identity so a failed door remains
    // retryable instead of creating an unreachable orphan.
    for (const mapId of ownedMapIds) {
      await hooks?.purgeMapChain(mapId);
    }
    await deleteOwnedMaps(userId);

    await bestEffort(
      'maps/purge',
      'user claim purge',
      userId,
      hooks ? () => hooks.purgeUserClaims(userId) : undefined,
    );
  },
};
