import { emitDomainEvent } from '@/data/domain-events/queries';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import {
  deleteEsiSnapshot,
  insertEsiSnapshot,
} from '@/data/esi-snapshots/queries';
import { snapshotRequestHash } from '@/data/esi-snapshots/request-hash';
import type { EsiSnapshotSource } from '@/data/esi-snapshots/types';
import { saveOwnedAssets } from '@/features/owned-assets/queries';
import type { OwnerKey } from '@/platform/owner-sync';

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
