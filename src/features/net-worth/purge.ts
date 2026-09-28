import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { netWorthDays } from './schema';

export const netWorthPurgeContributor: PurgeContributor = {
  name: 'net-worth',
  tier: 'durable',
  claims: [netWorthDays],
  merge: [{ table: netWorthDays, rule: 'survivor-wins', key: [netWorthDays.day] }],
  async purgeUser({ userId }) {
    await db.delete(netWorthDays).where(eq(netWorthDays.userId, userId));
  },
};
