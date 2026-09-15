import {
  purgeUserMapAccessProjection,
} from '@/composition/map-access-projection';
import { purgeMapChain } from '@/composition/map-purge';
import { teardownLocationTracking } from '@/data/location-tracking/purge';
import { affectedMapIdsForCharacter, getOwnedMapIds } from '@/data/maps/queries';
import { bestEffort } from '@/lib/best-effort';
import { enqueueMapAccessChanges } from '@/platform/auth/affiliation-store';
import type { IdentityProjectionRunners } from '@/platform/auth/identity-projection-runners';
import { reconcileAffiliationAccess } from './map-affiliation-access';

export async function reprojectMapsForCharacter(characterId: number): Promise<void> {
  const mapIds = await affectedMapIdsForCharacter(characterId);
  await enqueueMapAccessChanges(mapIds);
  if (mapIds.length > 0) await reconcileAffiliationAccess();
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
  try {
    await reprojectMapsForCharacter(args.characterId);
  } finally {
    await teardownLocationTracking(args.userId, args.characterId);
  }
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
