import { z } from 'zod';
import { isConvexConfigured } from '@/config/public-env';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { cancelPendingTracking } from './merge-store';
import { pendingTrackingMerges } from './schema';
import type { PurgeContributor } from '@/platform/purge/types';

export async function purgeLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  await postConvexHttpDoor({
    path: '/purge-location-tracking',
    body: { userId, characterId },
    schema: z.unknown(),
    error: Error,
    label: 'Location tracking purge',
  });
}

export async function teardownLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  await cancelPendingTracking(userId, characterId);
  if (!isConvexConfigured()) return;
  // A failure throws so the deletion stays requested and the daily run retries it.
  await purgeLocationTracking(userId, characterId);
}

export const locationTrackingPurgeContributor: PurgeContributor = {
  name: 'location-tracking',
  tier: 'durable',
  claims: [pendingTrackingMerges],
  merge: [{ table: pendingTrackingMerges, rule: 'rekey' }],
  purgeCharacter: ({ userId, characterId }) => teardownLocationTracking(userId, characterId),
  purgeUser: ({ userId }) => teardownLocationTracking(userId, null),
};
