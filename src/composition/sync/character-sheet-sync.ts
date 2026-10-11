import { mergeSheetSection, readSheetRow, stampSheetSection } from '@/features/character-sheet/queries';
import { refreshCharacterSheetForUser } from '@/features/character-sheet/refresh';
import type { SheetEndpoint, SheetPort } from '@/features/character-sheet/types';
import {
  characterLocationPath,
  characterOnlinePath,
  characterShipPath,
  universeStructurePath,
} from '@/platform/esi/paths';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';
import { enqueueBudgetDeferral } from './esi-refresh-owner-sync';

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

export function refreshCharacterSheetsOnView(userId: string): Promise<OwnerSyncResult[]> {
  return refreshCharacterSheetForUser(makeSheetPort(), userId, enqueueBudgetDeferral('character_sheet', userId));
}

/** Retry all stale sections for this pilot; one completed section cannot settle the whole sheet. */
export async function runCharacterSheetRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshCharacterSheetForUser(makeSheetPort(), userId, { target });
  return results.find((result) => result.kind === 'deferred_for_budget')
    ?? results.find((result) => result.kind === 'failed_retryable')
    ?? results.find((result) => result.kind === 'failed_permanent')
    ?? results[0]
    ?? { kind: 'failed_permanent', target, code: 'owner_unavailable' };
}
