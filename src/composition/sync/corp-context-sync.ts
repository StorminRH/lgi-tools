import { type CorpContextPort, refreshCorpContextForUser } from '@/data/corp-holdings/context-sync';
import { corpContextKeys, corporationKey, divisionsKey, memberTrackingKey } from '@/data/corp-holdings/keys';
import {
  getCorpHoldingContext,
  readCorpProfileState,
  saveCorpProfile,
  stampCorpProfileFresh,
} from '@/data/corp-holdings/queries';
import { isDue } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { STRUCTURE_LOOKUP_ROUTE } from '@/features/character-sheet/keys';
import { listLinkedCharacterIdsInCorporation } from '@/platform/auth/affiliation-store';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';

const ASSET_NAMES_ROUTE = '/corporations/{corporation_id}/assets/names/';

function makeCorpContextPort(): CorpContextPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (corporationId) => isDue(corpContextKeys(corporationId)),
    openSession: openReadSession,
    readCorporation: (session, corporationId, accessToken) => session.readAuthed(corporationKey(corporationId), accessToken),
    readDivisions: (session, corporationId, accessToken) => session.readAuthed(divisionsKey(corporationId), accessToken),
    readMemberTracking: (session, corporationId, accessToken) =>
      session.readAuthed(memberTrackingKey(corporationId), accessToken),
    readAssetNames: (session, corporationId, accessToken, itemIds) =>
      session.postPassThrough(ASSET_NAMES_ROUTE, { corporation_id: corporationId }, accessToken, itemIds),
    readStructure: (session, structureId, accessToken) =>
      session.readPassThrough(STRUCTURE_LOOKUP_ROUTE, { structure_id: structureId }, accessToken),
    currentContext: getCorpHoldingContext,
    listLinkedMemberIds: listLinkedCharacterIdsInCorporation,
    readProfileState: readCorpProfileState,
    saveProfile: saveCorpProfile,
    stampFresh: stampCorpProfileFresh,
  };
}

export const refreshCorpContextOnView = (userId: string) =>
  refreshCorpContextForUser(makeCorpContextPort(), userId);
