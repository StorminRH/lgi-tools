// Custom-structures purge contributor (ACCOUNT.1) — durable tier. App-authored,
// non-regenerable per-user saved structure definitions; torn down with the user.
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { customStructures } from './schema';

/**
 * Personal-data purge contributor for custom structures purge contributor; this data slice owns
 * deleting its user and character keyed rows.
 */
export const customStructuresPurgeContributor: PurgeContributor = {
  name: 'custom-structures',
  tier: 'durable',
  claims: [customStructures],
  async purgeUser({ userId }) {
    await db.delete(customStructures).where(eq(customStructures.userId, userId));
  },
};
