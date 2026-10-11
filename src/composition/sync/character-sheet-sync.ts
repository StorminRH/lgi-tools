import { mergeSheetSection, readSheetRow, stampSheetSection } from '@/features/character-sheet/queries';
import { refreshCharacterSheetForUser } from '@/features/character-sheet/refresh';
import type { SheetEndpoint, SheetPort } from '@/features/character-sheet/types';
import {
  characterLocationPath,
  characterOnlinePath,
  characterShipPath,
  universeStructurePath,
} from '@/platform/esi/paths';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';
import { ownerSyncDataset } from './esi-refresh-owner-sync';

export const SHEET_ESI_PATHS = {
  character: (id: number) => `/characters/${id}/`,
  location: characterLocationPath,
  ship: characterShipPath,
  online: characterOnlinePath,
  attributes: (id: number) => `/characters/${id}/attributes/`,
  implants: (id: number) => `/characters/${id}/implants/`,
  clones: (id: number) => `/characters/${id}/clones/`,
  wallet: (id: number) => `/characters/${id}/wallet/`,
  journal: (id: number) => `/characters/${id}/wallet/journal/`,
  orders: (id: number) => `/characters/${id}/orders/`,
} as const satisfies Record<SheetEndpoint, (id: number) => string>;

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
      readSingleEndpoint(universeStructurePath(structureId), accessToken, null),
    readSheet: readSheetRow,
    mergeSection: mergeSheetSection,
    stampSection: stampSheetSection,
  };
}

const sheet = ownerSyncDataset('character_sheet', makeSheetPort, refreshCharacterSheetForUser);

export const refreshCharacterSheetsOnView = sheet.onView;

/** Retry all stale sections for this pilot; one completed section cannot settle the whole sheet. */
export const runCharacterSheetRefreshJob = sheet.runJob;
