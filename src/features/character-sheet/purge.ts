import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { sheetTag } from './queries';
import { characterSheets } from './schema';

export const characterSheetPurgeContributor = characterCacheContributor(db, {
  name: 'character-sheet',
  tables: [{ table: characterSheets, characterId: characterSheets.characterId }],
  cacheTags: (characterId) => [sheetTag(characterId)],
});
