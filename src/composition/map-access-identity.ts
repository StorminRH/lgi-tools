import {
  purgeUserMapAccessProjection,
  revokeUserMapClaims,
} from '@/composition/map-access-projection';
import { purgeMapChain } from '@/composition/map-purge';
import { teardownLocationTracking } from '@/data/location-tracking/purge';
import { affectedMapIdsForCharacter, getOwnedMapIds } from '@/data/maps/queries';
import { bestEffort } from '@/lib/best-effort';
import { MAX_PENDING_BATCH, enqueueMapAccessChanges } from '@/platform/auth/affiliation-store';
import type { IdentityProjectionRunners } from '@/platform/auth/identity-projection-runners';
import { deliverCapturedMapAccessChanges, reconcileAffiliationAccess } from './map-affiliation-access';

export async function reprojectMapsForCharacter(characterId: number): Promise<void> {
  const pending = await enqueueMapAccessChanges(await affectedMapIdsForCharacter(characterId));
  if (pending.length === 0) return;
  await deliverCapturedMapAccessChanges(pending);
  if (pending.length > MAX_PENDING_BATCH) await reconcileAffiliationAccess();
}

export async function revokeCharacterMapClaims(userId: string, characterId: number): Promise<string[]> {
  const mapIds = await affectedMapIdsForCharacter(characterId);
  await revokeUserMapClaims(userId, mapIds);
  return mapIds;
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
  runBeforeCharacterUnlink: async ({ userId, characterId }) => {
    try {
      return await revokeCharacterMapClaims(userId, characterId);
    } catch (error) {
      // A later batch may fail after earlier batches removed valid claims.
      await bestEffort('identity-projection', 'restorePartialRevocation', String(characterId), () =>
        reprojectMapsForCharacter(characterId),
      );
      throw error;
    }
  },
  runAfterFailedCharacterUnlink: async (characterId) => {
    await bestEffort('identity-projection', 'restoreCharacterMapAccess', String(characterId), () =>
      reprojectMapsForCharacter(characterId),
    );
  },
  runAfterCharacterUnlink: async ({ userId, characterId, mapIds }) => {
    await bestEffort('identity-projection', 'finalizeCharacterRevocation', `${userId}:${characterId}`, () =>
      revokeUserMapClaims(userId, mapIds),
    );
  },
  runAfterCharacterLinkChanged: async (args) => {
    await bestEffort(
      'identity-projection',
      'afterCharacterLinkChanged',
      `${args.userId}:${args.characterId}`,
      () => afterCharacterLinkChanged(args),
    );
  },
};
