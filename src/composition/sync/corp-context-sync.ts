import { type CorpContextPort, refreshCorpContextForUser } from '@/data/corp-holdings/context-sync';
import {
  getCorpHoldingContext,
  readCorpProfileState,
  saveCorpProfile,
  stampCorpProfileFresh,
} from '@/data/corp-holdings/queries';
import { listLinkedCharacterIdsInCorporation } from '@/platform/auth/affiliation-store';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';
import {
  listCharactersWithHealth,
  postSingleEndpoint,
  readRolesFor,
  readSingleEndpoint,
  vendTokenFor,
} from './owner-sync-port';

function makeCorpContextPort(): CorpContextPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    readCorporation: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/`, accessToken, null),
    readDivisions: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/divisions/`, accessToken, null),
    readMemberTracking: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/membertracking/`, accessToken, null),
    readAssetNames: (corporationId, accessToken, itemIds) =>
      postSingleEndpoint(`/corporations/${corporationId}/assets/names/`, accessToken, itemIds),
    readStructure: (structureId, accessToken) =>
      readSingleEndpoint(`/universe/structures/${structureId}/`, accessToken, null),
    currentContext: getCorpHoldingContext,
    listLinkedMemberIds: listLinkedCharacterIdsInCorporation,
    readProfileState: readCorpProfileState,
    saveProfile: saveCorpProfile,
    stampFresh: stampCorpProfileFresh,
  };
}

/** The read path's write-behind: the Director context pass, budget-deferred like the owned datasets. */
export function refreshCorpContextOnView(userId: string): Promise<OwnerSyncResult[]> {
  return refreshCorpContextForUser(makeCorpContextPort(), userId, enqueueBudgetDeferral('corp_context', userId));
}

export async function runCorpContextRefreshJob(userId: string, target: OwnerSyncTarget): Promise<OwnerSyncResult> {
  const results = await refreshCorpContextForUser(makeCorpContextPort(), userId, { target });
  return targetedOwnerResult(target, results);
}
