// Owned-blueprints composition layer (MIGRATE.0). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character
// token vend, affiliation/scope reads) AND the owned-blueprints slice (the ESI→
// projection + Neon storage) — a cross-slice join the feature boundary forbids
// inside either slice (the sde-pipeline.ts pattern). This wires the real port the
// pure refresh orchestration runs over, and exposes the on-view seam 3.7.5.2's
// per-component ME transform consumes: read the current owned-BP map, fire a
// stale-gated write-behind refresh behind the response (zero added latency, like
// the affiliation on-view refresh and the market-prices getLivePrices). The shared
// auth + ESI port wiring lives in owner-sync-port.ts (MIGRATE.D.2).
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
import type { OwnerSyncResult, OwnerSyncTarget } from '@/lib/owner-sync';
import {
  listCharactersWithHealth,
  readPagedEndpoint,
  readRolesFor,
  resolveOwnedOwnersForUser,
  vendTokenFor,
} from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

// The real port: the shared auth + ESI wiring (owner-sync-port.ts) plus this slice's
// own Neon read/save/stamp. Blueprints is a paginated read (readPagedEndpoint).
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

// The on-view seam: resolve the owned-BP detail for the requested blueprint types
// immediately, and fire a stale-gated write-behind refresh behind the response. A
// re-view inside the 1h window makes no blueprint ESI call (the refresh's per-owner
// staleness gate is the dedup). Owner + NPC-station names are resolved server-side
// in ONE bounded /universe/names pass (day-cached, shared across viewers); player
// structures degrade to a generic label — no read_structures scope is taken.
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
