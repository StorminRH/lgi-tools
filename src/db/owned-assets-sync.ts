// Owned-assets composition layer (3.7.7.2). Lives here, above the slices, because
// it is the only point that touches BOTH the auth slice (per-character token vend,
// affiliation/scope reads) AND the owned-assets slice (the ESI→projection + Neon
// storage) — a cross-slice join the feature boundary forbids inside either slice
// (the sde-pipeline.ts pattern). This wires the real port the pure refresh
// orchestration runs over, and exposes the on-view seam the planner's asset ledger
// consumes: read the current owned-asset detail, fire a stale-gated write-behind
// refresh behind the response (zero added latency, like the owned-blueprints seam).
// A direct mirror of src/db/owned-blueprints-sync.ts; the shared auth + ESI port
// wiring lives in owner-sync-port.ts (MIGRATE.D.2).
import { after } from 'next/server';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { formatStationName } from '@/features/industry-planner/format-station-name';
import {
  buildOwnedAssetDetail,
  collectAssetNameIds,
  type OwnedAssetDetailEntry,
} from '@/features/owned-assets/detail';
import { getOwnedAssetMap, readOwnerSyncState, saveOwnedAssets, stampOwnerFresh } from '@/features/owned-assets/queries';
import { refreshOwnedAssetsForUser } from '@/features/owned-assets/refresh';
import type { OwnedAssetsPort } from '@/features/owned-assets/types';
import {
  listCharactersWithHealth,
  readPagedEndpoint,
  readRolesFor,
  resolveOwnedOwnersForUser,
  vendTokenFor,
} from './owner-sync-port';

// The real port: the shared auth + ESI wiring (owner-sync-port.ts) plus this slice's
// own Neon read/save/stamp. Assets is a paginated read (readPagedEndpoint); the
// aggregate-at-write summing lives in the slice's projection, not here.
function makeOwnedAssetsPort(): OwnedAssetsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    read: readPagedEndpoint,
    readSyncState: (owner) => readOwnerSyncState(owner),
    save: (owner, rows, etags) => saveOwnedAssets(owner, rows, etags),
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

// The on-view seam: resolve the owned-asset detail for the requested types
// immediately, and fire a stale-gated write-behind refresh behind the response. A
// re-view inside the 1h window makes no asset ESI call (the refresh's per-owner
// staleness gate is the dedup). Owner + NPC-station + solar-system names are
// resolved server-side in ONE bounded /universe/names pass (day-cached, shared
// across viewers); player structures / containers degrade to a generic label — no
// read_structures scope is taken.
export async function getOwnedAssetDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedAssetDetailEntry[]> {
  const owners = await resolveOwnedOwnersForUser(userId);
  const map = await getOwnedAssetMap(owners, requestedTypeIds);
  after(() => refreshOwnedAssetsForUser(makeOwnedAssetsPort(), userId));
  const names = await resolveEntityNames(collectAssetNameIds(map));
  return buildOwnedAssetDetail(map, names, formatStationName);
}
