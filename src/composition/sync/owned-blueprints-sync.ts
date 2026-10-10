import { after } from 'next/server';
import { getCorpAssetEvidence } from '@/features/owned-assets/queries';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { formatStationName } from '@/features/industry-planner/format-station-name';
import {
  buildOwnedDetail,
  collectDetailNameIds,
  type OwnedBlueprintDetailEntry,
} from '@/features/owned-blueprints/detail';
import { getOwnedBlueprintMap, readBlueprintSyncState, saveOwnedBlueprints, stampBlueprintFresh } from '@/features/owned-blueprints/queries';
import { refreshOwnedBlueprintsForUser } from '@/features/owned-blueprints/refresh';
import type { OwnedBlueprintsPort } from '@/features/owned-blueprints/types';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import { listCharactersWithHealth, readPagedEndpoint, probeAndStoreRoles, vendTokenFor } from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

function makeOwnedBlueprintsPort(): OwnedBlueprintsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: probeAndStoreRoles,
    read: readPagedEndpoint,
    readSyncState: (owner) => readBlueprintSyncState(owner),
    save: (owner, rows, etags) => saveOwnedBlueprints(owner, rows, etags),
    stampFresh: (owner) => stampBlueprintFresh(owner),
  };
}

export async function getOwnedBlueprintDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedBlueprintDetailEntry[]> {
  const viewer = await resolveCorpViewer(userId);
  const evidence = await mapByIdDroppingNulls(
    viewer.scope.corps.filter((grant) => grant.blueprints.kind === 'by-location').map((grant) => grant.corporationId),
    getCorpAssetEvidence,
  );
  const map = await getOwnedBlueprintMap(viewer.scope, evidence);
  after(() =>
    refreshOwnedBlueprintsForUser(
      makeOwnedBlueprintsPort(),
      userId,
      enqueueBudgetDeferral('owned_blueprints', userId),
    ),
  );
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectDetailNameIds(map, requestedTypeIds, contexts));
  return buildOwnedDetail(map, requestedTypeIds, names, formatStationName, contexts);
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
