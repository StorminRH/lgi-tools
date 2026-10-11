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
import { listCharactersWithHealth, readPagedEndpoint, probeAndStoreRoles, vendTokenFor } from './owner-sync-port';
import { ownerSyncDataset } from './esi-refresh-owner-sync';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

function makeOwnedAssetsPort(): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: probeAndStoreRoles,
    read: readPagedEndpoint,
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: saveOwnedAssetsFromSource,
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

const assets = ownerSyncDataset('owned_assets', makeOwnedAssetsPort, refreshOwnedAssetsForUser);
// Personal assets only, under the same key: a deferred character target is
// replayed by the full runner, which refreshes that character alone.
const characterAssets = ownerSyncDataset(
  'owned_assets',
  makeOwnedAssetsPort,
  refreshCharacterOwnedAssetsForUser,
);

export const runOwnedAssetsRefreshJob = assets.runJob;

/** The board's write-behind: personal assets only, budget-deferred like the planner's refresh. */
export const refreshCharacterAssetsOnView = characterAssets.onView;

export async function getOwnedAssetDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedAssetDetailEntry[]> {
  const viewer = await resolveCorpViewer(userId);
  const map = await getOwnedAssetMap(viewer.scope, requestedTypeIds);
  after(() => assets.onView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectAssetNameIds(map, contexts));
  return buildOwnedAssetDetail(map, names, formatStationName, contexts);
}
