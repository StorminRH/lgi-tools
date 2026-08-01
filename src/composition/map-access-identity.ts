// Projection side-effects for identity mutations that move or drop character
// links without going through mapsPurgeContributor (admin/self-service unlink,
// admin reassign / absorb-on-proof, and emptied-account user deletes).
import {
  projectMapAccess,
  purgeUserMapAccessProjection,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import {
  getCharacterCorporationId,
  getMapIdsWithCharacterGrant,
  getMapIdsWithCorporationGrants,
  getOwnedMapIds,
} from '@/data/maps/queries';
import { bestEffort } from '@/lib/best-effort';
import { registerIdentityProjectionHooks } from '@/platform/auth/identity-projection-hooks';

/**
 * Maps whose projected claims may change when a character leaves or joins a
 * user: direct character grants plus corporation grants matching the character's
 * cached corp id.
 */
export async function mapIdsAffectedByCharacter(characterId: number): Promise<string[]> {
  const corporationId = await getCharacterCorporationId(characterId);
  const characterMaps = await getMapIdsWithCharacterGrant(characterId);
  const corporationMaps =
    corporationId === null ? [] : await getMapIdsWithCorporationGrants([corporationId]);
  return [...new Set([...characterMaps, ...corporationMaps])];
}

/**
 * Re-projects every map whose claim set may have changed because a character
 * was unlinked or reassigned. Best-effort per map: callers that must never
 * throw (identity routes) wrap this in {@link runAfterCharacterLinkChanged}.
 */
export async function reprojectMapsForCharacter(characterId: number): Promise<void> {
  const mapIds = await mapIdsAffectedByCharacter(characterId);
  for (const mapId of mapIds) {
    await bestEffort('map-access-identity', 'projection', mapId, () =>
      projectMapAccess(mapId),
    );
  }
}

/**
 * Tears down Convex claims for maps a user owns and purges that user's claims
 * on every map. Call before the user row is deleted (FK cascade removes Neon
 * maps without reaching the maps purge contributor).
 */
export async function teardownProjectionsForDeletedUser(userId: string): Promise<void> {
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await bestEffort('map-access-identity', 'teardown', mapId, () =>
      teardownMapAccessProjection(mapId),
    );
  }
  await bestEffort('map-access-identity', 'user claim purge', userId, () =>
    purgeUserMapAccessProjection(userId),
  );
}

registerIdentityProjectionHooks({
  beforeUserDelete: teardownProjectionsForDeletedUser,
  afterCharacterLinkChanged: reprojectMapsForCharacter,
});
