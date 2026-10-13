import { after } from 'next/server';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { withCorpContextDueKeys } from '@/data/corp-holdings/context-sync';
import { isDueFor, recordRefusalFor } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import {
  buildOwnedAssetDetail,
  collectAssetNameIds,
  type OwnedAssetDetailEntry,
} from '@/features/owned-assets/detail';
import { ownedAssetsDueKeys, ownedAssetsKey } from '@/features/owned-assets/keys';
import { getOwnedAssetMap, readOwnerSyncState, stampOwnerFresh } from '@/features/owned-assets/queries';
import {
  refreshCharacterOwnedAssetsForUser,
  refreshOwnedAssetsForUser,
} from '@/features/owned-assets/refresh';
import type { OwnedAssetsPort } from '@/features/owned-assets/types';
import { formatStationName } from '@/lib/format/names';
import { singleFlight } from '@/lib/memoize';
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import { refreshDue } from './live-dataset-view';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

/** The port of one user's pass: a corporation's answer is shared, but a due check and a refusal are this user's. */
function makeOwnedAssetsPort(userId: string): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (owner) => isDueFor(userId, [ownedAssetsKey(owner)]),
    openSession: openReadSession,
    read: (session, owner, accessToken) => session.readPaged(ownedAssetsKey(owner), accessToken),
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: saveOwnedAssetsFromSource,
    stampFresh: (owner) => stampOwnerFresh(owner),
    recordRefusal: (owner, expiresAt) => recordRefusalFor(userId, [ownedAssetsKey(owner)], expiresAt),
  };
}

const ownedAssetsInFlight = singleFlight((userId: string) => refreshOwnedAssetsForUser(makeOwnedAssetsPort(userId), userId));

/** The refresh a view schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
export function refreshOwnedAssetsOnView(userId: string) {
  return ownedAssetsInFlight(userId);
}

const characterAssetsInFlight = singleFlight((userId: string) =>
  refreshCharacterOwnedAssetsForUser(makeOwnedAssetsPort(userId), userId));

/** The board's write-behind: personal assets only, never a Director's corporation pass. One run in flight per user, as above. */
export function refreshCharacterAssetsOnView(userId: string) {
  return characterAssetsInFlight(userId);
}

export async function getOwnedAssetDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<{ assets: OwnedAssetDetailEntry[]; refreshing: boolean }> {
  const viewer = await resolveCorpViewer(userId);
  const [map, refreshing] = await Promise.all([
    getOwnedAssetMap(viewer.scope, requestedTypeIds),
    refreshDue(userId, withCorpContextDueKeys(ownedAssetsDueKeys)),
  ]);
  after(() => refreshOwnedAssetsOnView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectAssetNameIds(map, contexts));
  return { assets: buildOwnedAssetDetail(map, names, formatStationName, contexts), refreshing };
}
