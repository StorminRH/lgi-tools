import { z } from 'zod';
import { isConvexConfigured } from '@/config/public-env';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import type { PurgeContributor } from '@/platform/purge/types';

async function postPurgeOnline(userId: string, characterId: number | null): Promise<void> {
  if (!isConvexConfigured()) return;
  // A failure throws so the deletion stays requested and the daily run retries it.
  await postConvexHttpDoor({
    path: '/purge-online',
    body: { userId, characterId },
    schema: z.unknown(),
    error: Error,
    label: 'Online status purge',
  });
}

export const onlineStatusPurgeContributor: PurgeContributor = {
  name: 'online-status',
  tier: 'cache',
  claims: [],
  merge: [],
  purgeCharacter: ({ userId, characterId }) => postPurgeOnline(userId, characterId),
  purgeUser: ({ userId }) => postPurgeOnline(userId, null),
};
