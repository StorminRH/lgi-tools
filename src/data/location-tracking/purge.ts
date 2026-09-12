import { bestEffort } from '@/lib/best-effort';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import type { PurgeContributor } from '@/platform/purge/types';

export async function purgeLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return;
  const siteUrl = deriveConvexSiteUrl(convexUrl);
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  if (siteUrl === null || !secret) {
    throw new Error('Location tracking purge requires a valid Convex URL and service secret');
  }
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
  const subject = characterId === null ? userId : `${userId}:${characterId}`;
  await bestEffort('location-tracking/purge', 'convex-teardown', subject, () =>
    purgeLocationTracking(userId, characterId),
  );
}

export const locationTrackingPurgeContributor: PurgeContributor = {
  name: 'location-tracking',
  tier: 'durable',
  claims: [],
  purgeCharacter: ({ userId, characterId }) =>
    teardownLocationTracking(userId, characterId),
  purgeUser: ({ userId }) => teardownLocationTracking(userId, null),
};
