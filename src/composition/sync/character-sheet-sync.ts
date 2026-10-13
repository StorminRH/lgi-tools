import { isDue, recordRefusal } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { sectionKeys, sheetEndpointKey, STRUCTURE_LOOKUP_ROUTE } from '@/features/character-sheet/keys';
import { mergeSheetSection, readSheetRow, stampSheetSection } from '@/features/character-sheet/queries';
import { refreshCharacterSheetForUser } from '@/features/character-sheet/refresh';
import type { SheetPort } from '@/features/character-sheet/types';
import { memoizeAsync, singleFlight } from '@/lib/memoize';
import { listCharactersWithHealth, vendTokenFor } from './owner-sync-port';

export function makeSheetPort(): SheetPort {
  return {
    now: () => new Date(),
    listCharacters: memoizeAsync(listCharactersWithHealth),
    vendToken: memoizeAsync(vendTokenFor),
    isSectionDue: (characterId, key) => isDue(sectionKeys(characterId, key)),
    openSession: openReadSession,
    readEndpoint: (session, characterId, endpoint, accessToken) =>
      session.readAuthed(sheetEndpointKey(characterId, endpoint), accessToken),
    readStructure: (session, structureId, accessToken) =>
      session.readPassThrough(STRUCTURE_LOOKUP_ROUTE, { structure_id: structureId }, accessToken),
    readSheet: readSheetRow,
    mergeSection: mergeSheetSection,
    stampSection: stampSheetSection,
    recordSectionRefusal: (characterId, key, expiresAt) => recordRefusal(sectionKeys(characterId, key), expiresAt),
  };
}

const sheetsInFlight = singleFlight((userId: string) => refreshCharacterSheetForUser(makeSheetPort(), userId));

/** The refresh a view schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
export function refreshCharacterSheetsOnView(userId: string) {
  return sheetsInFlight(userId);
}
