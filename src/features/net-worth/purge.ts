import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { netWorthDays } from './schema';

export async function eraseNetWorthHistoryForCharacter(userId: string, characterId: number): Promise<void> {
  // A historical total includes this pilot too: remove the entire day on unlink or transfer.
  await db.delete(netWorthDays).where(and(
    eq(netWorthDays.userId, userId),
    sql`${netWorthDays.pilots} ? ${String(characterId)}`,
  ));
}

export const netWorthPurgeContributor: PurgeContributor = {
  name: 'net-worth',
  tier: 'durable',
  claims: [netWorthDays],
  merge: [{ table: netWorthDays, rule: 'survivor-wins', key: [netWorthDays.day] }],
  async purgeCharacter({ userId, characterId }) {
    await eraseNetWorthHistoryForCharacter(userId, characterId);
  },
  async purgeUser({ userId }) {
    await db.delete(netWorthDays).where(eq(netWorthDays.userId, userId));
  },
};
