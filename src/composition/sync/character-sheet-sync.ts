import { mergeSheetSection, readSheetRow, stampSheetSection } from '@/features/character-sheet/queries';
import { refreshCharacterSheetForUser } from '@/features/character-sheet/refresh';
import type { SheetEndpoint, SheetPort } from '@/features/character-sheet/types';
import type { OwnerSyncResult } from '@/platform/owner-sync';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';

export const SHEET_ESI_PATHS = {
  character: (id: number) => `/characters/${id}/`,
  location: (id: number) => `/characters/${id}/location/`,
  ship: (id: number) => `/characters/${id}/ship/`,
  online: (id: number) => `/characters/${id}/online/`,
  attributes: (id: number) => `/characters/${id}/attributes/`,
  implants: (id: number) => `/characters/${id}/implants/`,
  clones: (id: number) => `/characters/${id}/clones/`,
  wallet: (id: number) => `/characters/${id}/wallet/`,
  journal: (id: number) => `/characters/${id}/wallet/journal/`,
  orders: (id: number) => `/characters/${id}/orders/`,
} as const satisfies Record<SheetEndpoint, (id: number) => string>;

export const STRUCTURE_ESI_PATH = (structureId: number) => `/universe/structures/${structureId}/`;

function memoizePerRun<A, R>(fn: (arg: A) => Promise<R>): (arg: A) => Promise<R> {
  const pending = new Map<A, Promise<R>>();
  return (arg) => {
    const hit = pending.get(arg);
    if (hit !== undefined) return hit;
    const result = fn(arg);
    pending.set(arg, result);
    return result;
  };
}

export function makeSheetPort(): SheetPort {
  return {
    now: () => new Date(),
    listCharacters: memoizePerRun(listCharactersWithHealth),
    vendToken: memoizePerRun(vendTokenFor),
    readEndpoint: (characterId, endpoint, accessToken, heldEtag) =>
      readSingleEndpoint(SHEET_ESI_PATHS[endpoint](characterId), accessToken, heldEtag),
    readStructure: (structureId, accessToken) =>
      readSingleEndpoint(STRUCTURE_ESI_PATH(structureId), accessToken, null),
    readSheet: readSheetRow,
    mergeSection: mergeSheetSection,
    stampSection: stampSheetSection,
  };
}

export function refreshCharacterSheetsOnView(userId: string): Promise<OwnerSyncResult[]> {
  return refreshCharacterSheetForUser(makeSheetPort(), userId);
}
