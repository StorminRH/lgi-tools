import {
  projectMapAccess,
  purgeUserMapAccessProjection,
} from '@/composition/map-access-projection';
import { purgeMapChain } from '@/composition/map-purge';
import { teardownLocationTracking } from '@/data/location-tracking/purge';
import { affectedMapIdsForCharacter, getOwnedMapIds } from '@/data/maps/queries';
import { bestEffort } from '@/lib/best-effort';
import type { IdentityProjectionRunners } from '@/platform/auth/identity-projection-runners';

export async function reprojectMapsForCharacter(characterId: number): Promise<void> {
  const mapIds = await affectedMapIdsForCharacter(characterId);
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

export const identityProjectionRunners: IdentityProjectionRunners = {
  runBeforeUserDelete: teardownProjectionsForDeletedUser,
  runAfterCharacterLinkChanged: async (args) => {
    await bestEffort(
      'identity-projection',
      'afterCharacterLinkChanged',
      `${args.userId}:${args.characterId}`,
      () => afterCharacterLinkChanged(args),
    );
  },
};
