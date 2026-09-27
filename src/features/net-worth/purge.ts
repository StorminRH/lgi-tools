import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { netWorthDays } from './schema';

export const netWorthPurgeContributor: PurgeContributor = {
  name: 'net-worth',
  tier: 'durable',
  claims: [netWorthDays],
  async purgeUser({ userId }) {
    await db.delete(netWorthDays).where(eq(netWorthDays.userId, userId));
  },
};
