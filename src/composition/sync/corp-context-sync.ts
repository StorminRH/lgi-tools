import { type CorpContextPort, refreshCorpContextForUser } from '@/data/corp-holdings/context-sync';
import {
  getCorpHoldingContext,
  readCorpProfileState,
  saveCorpProfile,
  stampCorpProfileFresh,
} from '@/data/corp-holdings/queries';
import { listLinkedCharacterIdsInCorporation } from '@/platform/auth/affiliation-store';
import { universeStructurePath } from '@/platform/esi/paths';
import { ownerSyncDataset } from './esi-refresh-owner-sync';
import {
  listCharactersWithHealth,
  postSingleEndpoint,
  probeAndStoreRoles,
  readSingleEndpoint,
  vendTokenFor,
} from './owner-sync-port';

function makeCorpContextPort(): CorpContextPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: probeAndStoreRoles,
    readCorporation: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/`, accessToken, null),
    readDivisions: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/divisions/`, accessToken, null),
    readMemberTracking: (corporationId, accessToken) =>
      readSingleEndpoint(`/corporations/${corporationId}/membertracking/`, accessToken, null),
    readAssetNames: (corporationId, accessToken, itemIds) =>
      postSingleEndpoint(`/corporations/${corporationId}/assets/names/`, accessToken, itemIds),
    readStructure: (structureId, accessToken) =>
      readSingleEndpoint(universeStructurePath(structureId), accessToken, null),
    currentContext: getCorpHoldingContext,
    listLinkedMemberIds: listLinkedCharacterIdsInCorporation,
    readProfileState: readCorpProfileState,
    saveProfile: saveCorpProfile,
    stampFresh: stampCorpProfileFresh,
  };
}

const corpContext = ownerSyncDataset('corp_context', makeCorpContextPort, refreshCorpContextForUser);

export const refreshCorpContextOnView = corpContext.onView;
export const runCorpContextRefreshJob = corpContext.runJob;
