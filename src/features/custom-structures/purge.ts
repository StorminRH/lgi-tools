import { db } from '@/db';
import { userRowsContributor } from '@/platform/purge/contributors';
import { customStructures } from './schema';

export const customStructuresPurgeContributor = userRowsContributor(db, {
  name: 'custom-structures',
  table: customStructures,
  merge: { rule: 'rekey' },
});
