import { after } from 'next/server';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { formatStationName } from '@/features/industry-planner/format-station-name';
import {
  buildOwnedDetail,
  collectDetailNameIds,
  type OwnedBlueprintDetailEntry,
} from '@/features/owned-blueprints/detail';
import { getOwnedBlueprintMap, readOwnerSyncState, saveOwnedBlueprints, stampOwnerFresh } from '@/features/owned-blueprints/queries';
import { refreshOwnedBlueprintsForUser } from '@/features/owned-blueprints/refresh';
import type { OwnedBlueprintsPort } from '@/features/owned-blueprints/types';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import {
  listCharactersWithHealth,
  readPagedEndpoint,
  readRolesFor,
  resolveOwnedOwnersForUser,
  vendTokenFor,
} from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

function makeOwnedBlueprintsPort(): OwnedBlueprintsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    read: readPagedEndpoint,
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: (owner, rows, etags) => saveOwnedBlueprints(owner, rows, etags),
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

export async function getOwnedBlueprintDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedBlueprintDetailEntry[]> {
  const owners = await resolveOwnedOwnersForUser(userId);
  const map = await getOwnedBlueprintMap(owners);
  after(() =>
    refreshOwnedBlueprintsForUser(
      makeOwnedBlueprintsPort(),
      userId,
      enqueueBudgetDeferral('owned_blueprints', userId),
    ),
  );
  const names = await resolveEntityNames(collectDetailNameIds(map, requestedTypeIds));
  return buildOwnedDetail(map, requestedTypeIds, names, formatStationName);
}

export async function runOwnedBlueprintsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshOwnedBlueprintsForUser(makeOwnedBlueprintsPort(), userId, {
    target,
  });
  return targetedOwnerResult(target, results);
}
