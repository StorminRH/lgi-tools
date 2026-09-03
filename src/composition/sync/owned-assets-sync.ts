import { after } from 'next/server';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { formatStationName } from '@/features/industry-planner/format-station-name';
import {
  buildOwnedAssetDetail,
  collectAssetNameIds,
  type OwnedAssetDetailEntry,
} from '@/features/owned-assets/detail';
import { getOwnedAssetMap, readOwnerSyncState, stampOwnerFresh } from '@/features/owned-assets/queries';
import { refreshOwnedAssetsForUser } from '@/features/owned-assets/refresh';
import type { OwnedAssetsPort } from '@/features/owned-assets/types';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import {
  listCharactersWithHealth,
  readPagedEndpoint,
  readRolesFor,
  resolveOwnedOwnersForUser,
  vendTokenFor,
} from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

function makeOwnedAssetsPort(): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    read: readPagedEndpoint,
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: saveOwnedAssetsFromSource,
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

export async function getOwnedAssetDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedAssetDetailEntry[]> {
  const owners = await resolveOwnedOwnersForUser(userId);
  const map = await getOwnedAssetMap(owners, requestedTypeIds);
  after(() =>
    refreshOwnedAssetsForUser(
      makeOwnedAssetsPort(),
      userId,
      enqueueBudgetDeferral('owned_assets', userId),
    ),
  );
  const names = await resolveEntityNames(collectAssetNameIds(map));
  return buildOwnedAssetDetail(map, names, formatStationName);
}

export async function runOwnedAssetsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshOwnedAssetsForUser(makeOwnedAssetsPort(), userId, { target });
  return targetedOwnerResult(target, results);
}
