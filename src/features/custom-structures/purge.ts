import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { customStructures } from './schema';

export const customStructuresPurgeContributor: PurgeContributor = {
  name: 'custom-structures',
  tier: 'durable',
  claims: [customStructures],
  async purgeUser({ userId }) {
    await db.delete(customStructures).where(eq(customStructures.userId, userId));
  },
};
