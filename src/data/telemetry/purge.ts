import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { usageLogs } from './schema';

export const telemetryPurgeContributor: PurgeContributor = {
  name: 'telemetry',
  tier: 'cache',
  claims: [usageLogs],
  async purgeCharacter({ characterId }) {
    await db.delete(usageLogs).where(eq(usageLogs.characterId, characterId));
  },
};
