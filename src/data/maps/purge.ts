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
 * Optional one-way Convex projection side-effects for maps purge. Composition
 * registers these because the data slice cannot import composition under Fallow,
 * and re-projection needs resolveMapPrincipals. Absent hooks, Neon teardown still
 * completes; claims heal on the next successful projection or resync.
 */
export interface MapAccessProjectionPurgeHooks {
  readonly projectMap: (mapId: string) => Promise<void>;
  readonly teardownMap: (mapId: string) => Promise<void>;
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
 * their cascading grants. After durable deletes, registered Convex projection hooks re-project
 * or tear down claims best-effort so the Neon purge never aborts on a Convex outage.
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
    await deleteOwnedMaps(userId);

    const hooks = projectionHooks;
    for (const mapId of ownedMapIds) {
      await bestEffort(
        'maps/purge',
        'teardown',
        mapId,
        hooks ? () => hooks.teardownMap(mapId) : undefined,
      );
    }
    await bestEffort(
      'maps/purge',
      'user claim purge',
      userId,
      hooks ? () => hooks.purgeUserClaims(userId) : undefined,
    );
  },
};
