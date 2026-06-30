// Telemetry purge contributor (ACCOUNT.1) — cache tier. D-6: a character's usage
// rows go with the character; the anonymous (character_id IS NULL) rows stay —
// they're the identity-free reach counter, not personal data. A data slice imports
// the contributor type from @/purge/types the same boundary-clean way a feature does
// (the proven src/data/tools/search.ts → @/search edge).
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { usageLogs } from './schema';

export const telemetryPurgeContributor: PurgeContributor = {
  name: 'telemetry',
  tier: 'cache',
  claims: [usageLogs],
  async purgeCharacter({ characterId }) {
    await db.delete(usageLogs).where(eq(usageLogs.characterId, characterId));
  },
};
