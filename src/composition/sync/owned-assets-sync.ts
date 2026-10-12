import { after } from 'next/server';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import {
  buildOwnedAssetDetail,
  collectAssetNameIds,
  type OwnedAssetDetailEntry,
} from '@/features/owned-assets/detail';
import { getOwnedAssetMap, readOwnerSyncState, stampOwnerFresh } from '@/features/owned-assets/queries';
import {
  refreshCharacterOwnedAssetsForUser,
  refreshOwnedAssetsForUser,
} from '@/features/owned-assets/refresh';
import type { OwnedAssetsPort } from '@/features/owned-assets/types';
import { formatStationName } from '@/lib/format/names';
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import { listCharactersWithHealth, readPagedEndpoint, readRolesForSync, vendTokenFor } from './owner-sync-port';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

function makeOwnedAssetsPort(): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    read: readPagedEndpoint,
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
): Promise<OwnedAssetDetailEntry[]> {
  const viewer = await resolveCorpViewer(userId);
  const map = await getOwnedAssetMap(viewer.scope, requestedTypeIds);
  after(() => refreshOwnedAssetsOnView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectAssetNameIds(map, contexts));
  return buildOwnedAssetDetail(map, names, formatStationName, contexts);
}
