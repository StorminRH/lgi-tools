import { db } from '@/db';
import { userRowsContributor } from '@/platform/purge/contributors';
import { userPreferences } from './schema';

export const preferencesPurgeContributor = userRowsContributor(db, {
  name: 'preferences',
  table: userPreferences,
  merge: { rule: 'survivor-wins', key: [userPreferences.key] },
});
