import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { usageLogs } from './schema';

export const telemetryPurgeContributor = characterCacheContributor(db, {
  name: 'telemetry',
  tables: [{ table: usageLogs, characterId: usageLogs.characterId }],
});
