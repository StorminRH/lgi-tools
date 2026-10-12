import { after } from 'next/server';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { isDue } from '@/data/esi-store';
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
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import { refreshDue } from './live-dataset-view';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

function makeOwnedAssetsPort(): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (owner) => isDue([ownedAssetsKey(owner)]),
    openSession: openReadSession,
    read: (session, owner, accessToken) => session.readPaged(ownedAssetsKey(owner), accessToken),
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: saveOwnedAssetsFromSource,
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

export const refreshOwnedAssetsOnView = (userId: string) =>
  refreshOwnedAssetsForUser(makeOwnedAssetsPort(), userId);

/** The board's write-behind: personal assets only, never a Director's corporation pass. */
export const refreshCharacterAssetsOnView = (userId: string) =>
  refreshCharacterOwnedAssetsForUser(makeOwnedAssetsPort(), userId);

export async function getOwnedAssetDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<{ assets: OwnedAssetDetailEntry[]; refreshing: boolean }> {
  const viewer = await resolveCorpViewer(userId);
  const [map, refreshing] = await Promise.all([
    getOwnedAssetMap(viewer.scope, requestedTypeIds),
    refreshDue(userId, ownedAssetsDueKeys),
  ]);
  after(() => refreshOwnedAssetsOnView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectAssetNameIds(map, contexts));
  return { assets: buildOwnedAssetDetail(map, names, formatStationName, contexts), refreshing };
}
