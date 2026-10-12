import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { characterSheets } from './schema';

export const characterSheetPurgeContributor = characterCacheContributor(db, {
  name: 'character-sheet',
  tables: [{ table: characterSheets, characterId: characterSheets.characterId }],
});
