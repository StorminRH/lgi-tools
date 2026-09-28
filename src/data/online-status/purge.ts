import { resolveConvexServiceDoor } from '@/lib/convex-service-door';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PurgeContributor } from '@/platform/purge/types';

async function postPurgeOnline(userId: string, characterId: number | null): Promise<void> {
  try {
    const door = resolveConvexServiceDoor();
    if (!door.ok) return;
    const { siteUrl, secret } = door;
    await fetchWithTimeout(`${siteUrl}/purge-online`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId, characterId }),
    });
  } catch {
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
