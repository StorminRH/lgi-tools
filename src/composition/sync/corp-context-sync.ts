import { type CorpContextPort, refreshCorpContextForUser } from '@/data/corp-holdings/context-sync';
import { corpContextKeys, corporationKey, divisionsKey, memberTrackingKey } from '@/data/corp-holdings/keys';
import {
  getCorpHoldingContext,
  readCorpProfileState,
  saveCorpProfile,
  stampCorpProfileFresh,
} from '@/data/corp-holdings/queries';
import { isDueFor, recordRefusalFor } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { STRUCTURE_LOOKUP_ROUTE } from '@/features/character-sheet/keys';
import { singleFlight } from '@/lib/memoize';
import { listLinkedCharacterIdsInCorporation } from '@/platform/auth/affiliation-store';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';

const ASSET_NAMES_ROUTE = '/corporations/{corporation_id}/assets/names/';

/** The port of one user's pass: the corporation answers are shared, but a due check and a refusal are this user's. */
function makeCorpContextPort(userId: string): CorpContextPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (corporationId) => isDueFor(userId, corpContextKeys(corporationId)),
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
    recordRefusal: (corporationId, expiresAt) => recordRefusalFor(userId, corpContextKeys(corporationId), expiresAt),
  };
}

const corpContextInFlight = singleFlight((userId: string) => refreshCorpContextForUser(makeCorpContextPort(userId), userId));

/** The refresh a view schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
export function refreshCorpContextOnView(userId: string) {
  return corpContextInFlight(userId);
}
