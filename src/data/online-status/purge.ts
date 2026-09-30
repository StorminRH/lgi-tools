import { resolveConvexServiceDoor } from '@/lib/convex-service-door';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PurgeContributor } from '@/platform/purge/types';

async function postPurgeOnline(userId: string, characterId: number | null): Promise<void> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;
  const door = resolveConvexServiceDoor();
  if (!door.ok) {
    throw new Error('Online status purge requires a valid Convex URL and service secret');
  }
  const { siteUrl, secret } = door;
  // A failure throws so the deletion stays requested and the daily run retries it.
  const response = await fetchWithTimeout(`${siteUrl}/purge-online`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ userId, characterId }),
  });
  if (!response.ok) {
    throw new Error(`purge-online ${response.status}`);
  }
}

export const onlineStatusPurgeContributor: PurgeContributor = {
  name: 'online-status',
  tier: 'cache',
  claims: [],
  merge: [],
  purgeCharacter: ({ userId, characterId }) => postPurgeOnline(userId, characterId),
  purgeUser: ({ userId }) => postPurgeOnline(userId, null),
};
