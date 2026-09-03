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
import {
  createIdentityProjectionRunners,
  type IdentityProjectionHooks,
} from '@/platform/auth/identity-projection-hooks';

export async function mapIdsAffectedByCharacter(characterId: number): Promise<string[]> {
  const corporationId = await getCharacterCorporationId(characterId);
  const characterMaps = await getMapIdsWithCharacterGrant(characterId);
  const corporationMaps =
    corporationId === null ? [] : await getMapIdsWithCorporationGrants([corporationId]);
  return [...new Set([...characterMaps, ...corporationMaps])];
}

export async function reprojectMapsForCharacter(characterId: number): Promise<void> {
  const mapIds = await mapIdsAffectedByCharacter(characterId);
  for (const mapId of mapIds) {
    await bestEffort('map-access-identity', 'projection', mapId, () =>
      projectMapAccess(mapId),
    );
  }
}

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

const hooks: IdentityProjectionHooks = {
  beforeUserDelete: teardownProjectionsForDeletedUser,
  afterCharacterLinkChanged,
};

export const identityProjectionRunners = createIdentityProjectionRunners(hooks);
