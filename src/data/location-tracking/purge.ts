import { bestEffort } from '@/lib/best-effort';
import { resolveConvexServiceDoor } from '@/lib/convex-service-door';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { cancelPendingTracking } from './merge-store';
import { pendingTrackingMerges } from './schema';
import type { PurgeContributor } from '@/platform/purge/types';

export async function purgeLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  const door = resolveConvexServiceDoor();
  if (!door.ok) {
    throw new Error('Location tracking purge requires a valid Convex URL and service secret');
  }
  const { siteUrl, secret } = door;
  const response = await fetchWithTimeout(`${siteUrl}/purge-location-tracking`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ userId, characterId }),
  });
  if (!response.ok) {
    throw new Error(`purge-location-tracking ${response.status}`);
  }
}

export async function teardownLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  await cancelPendingTracking(userId, characterId);
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;
  const subject = characterId === null ? userId : `${userId}:${characterId}`;
  await bestEffort('location-tracking/purge', 'convex-teardown', subject, () =>
    purgeLocationTracking(userId, characterId),
  );
}

export const locationTrackingPurgeContributor: PurgeContributor = {
  name: 'location-tracking',
  tier: 'durable',
  claims: [pendingTrackingMerges],
  merge: [{ table: pendingTrackingMerges, rule: 'rekey' }],
  purgeCharacter: ({ userId, characterId }) => teardownLocationTracking(userId, characterId),
  purgeUser: ({ userId }) => teardownLocationTracking(userId, null),
};
