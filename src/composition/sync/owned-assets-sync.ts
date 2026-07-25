// Owned-assets composition layer (3.7.7.2). Lives here, above the slices, because
// it is the only point that touches BOTH the auth slice (per-character token vend,
// affiliation/scope reads) AND the owned-assets slice (the ESI→projection + Neon
// storage) — a cross-slice join the feature boundary forbids inside either slice
// (the sde-pipeline.ts pattern). This wires the real port the pure refresh
// orchestration runs over, and exposes the on-view seam the planner's asset ledger
// consumes: read the current owned-asset detail, fire a stale-gated write-behind
// refresh behind the response (zero added latency, like the owned-blueprints seam).
// A direct mirror of src/composition/sync/owned-blueprints-sync.ts; the shared auth + ESI port
// wiring lives in owner-sync-port.ts (MIGRATE.D.2).
import { after } from 'next/server';
import { emitDomainEvent } from '@/data/domain-events/queries';
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
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import {
  deleteEsiSnapshot,
  insertEsiSnapshot,
} from '@/data/esi-snapshots/queries';
import { snapshotRequestHash } from '@/data/esi-snapshots/request-hash';
import type { EsiSnapshotSource } from '@/data/esi-snapshots/types';
import type { OwnerKey, OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import {
  listCharactersWithHealth,
  readPagedEndpoint,
  readRolesFor,
  resolveOwnedOwnersForUser,
  vendTokenFor,
} from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

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
    save: saveOwnedAssetsFromSource,
    stampFresh: (owner) => stampOwnerFresh(owner),
  };
}

/**
 * Persists one validated owned-assets source snapshot and replaces the owner's current projection.
 * The snapshot insert and the projection write are NOT atomic — the request path has no transaction
 * — so this compensates instead: if the projection write does not stand, the snapshot row it was
 * retained for is deleted and no domain event is emitted.
 */
export async function saveOwnedAssetsFromSource(
  owner: OwnerKey,
  rows: Parameters<typeof saveOwnedAssets>[1],
  etags: string[],
  source: EsiSnapshotSource,
): Promise<void> {
  if (owner.ownerType === 'character') {
    await saveOwnedAssets(owner, rows, etags);
    return;
  }
  const snapshotId = await insertEsiSnapshot({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    endpoint: source.endpoint,
    requestHash: snapshotRequestHash(source.endpoint, ESI_COMPATIBILITY_DATE),
    etag: source.responseHeaders.find((headers) => headers.page === 1)?.etag ?? etags[0] ?? null,
    responseHeaders: source.responseHeaders,
    fetchedAt: new Date(),
    sourceVersion: ESI_COMPATIBILITY_DATE,
    bodyCiphertext: encryptSnapshotBody(source.items),
  });
  let outcome: Awaited<ReturnType<typeof saveOwnedAssets>>;
  try {
    outcome = await saveOwnedAssets(owner, rows, etags, snapshotId);
  } catch (error) {
    await discardSnapshot(snapshotId);
    throw error;
  }
  // A concurrent refresh already replaced this owner's set, so these rows never
  // landed and this snapshot documents nothing: drop it and stay silent. Emitting
  // the event here would claim a pull that the winner already reported.
  if (outcome === 'superseded') {
    await discardSnapshot(snapshotId);
    return;
  }
  emitDomainEvent({
    eventType: 'esi_snapshot_pulled',
    metadata: {
      snapshotId,
      dataset: 'owned_assets',
      ownerType: 'corporation',
      ownerId: owner.ownerId,
      itemCount: source.items.length,
    },
  });
}

// Cleanup is best-effort on purpose: the caller's own outcome (a thrown error or
// a superseded write) is the real result, and the retention prune sweeps any row
// this fails to remove.
async function discardSnapshot(snapshotId: number): Promise<void> {
  try {
    await deleteEsiSnapshot(snapshotId);
  } catch (cleanupError) {
    console.warn('[esi-snapshots] orphan cleanup failed', cleanupError);
  }
}

/**
 * The on-view seam: resolve the owned-asset detail for the requested types
 * immediately, and fire a stale-gated write-behind refresh behind the response. A
 * re-view inside the 1h window makes no asset ESI call (the refresh's per-owner
 * staleness gate is the dedup). Owner + NPC-station + solar-system names are
 * resolved server-side in ONE bounded /universe/names pass (day-cached, shared
 * across viewers); player structures / containers degrade to a generic label — no
 * read_structures scope is taken.
 */
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

/**
 * Refreshes owned assets for one owner through the shared owner-sync port, including raw snapshot
 * retention and stored-source fallback.
 */
export async function runOwnedAssetsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshOwnedAssetsForUser(makeOwnedAssetsPort(), userId, { target });
  return targetedOwnerResult(target, results);
}
