import {
  projectMapAccess,
  purgeUserMapAccessProjection,
} from '@/composition/map-access-projection';
import { purgeMapChain } from '@/composition/map-purge';
import { teardownLocationTracking } from '@/data/location-tracking/purge';
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
 * Purges every owned collaborative chain before the user-row cascade removes
 * its durable map identity, then clears any claims the user holds on shared maps.
 * Full-chain failures propagate so the user row remains retryable.
 */
export async function teardownProjectionsForDeletedUser(userId: string): Promise<void> {
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await purgeMapChain(mapId);
  }
  await bestEffort('map-access-identity', 'user claim purge', userId, () =>
    purgeUserMapAccessProjection(userId),
  );
  await teardownLocationTracking(userId, null);
}

async function afterCharacterLinkChanged(args: {
  userId: string;
  characterId: number;
}): Promise<void> {
  await reprojectMapsForCharacter(args.characterId);
  await teardownLocationTracking(args.userId, args.characterId);
}

registerIdentityProjectionHooks({
  beforeUserDelete: teardownProjectionsForDeletedUser,
  afterCharacterLinkChanged,
});
