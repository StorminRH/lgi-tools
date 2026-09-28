import { emitDomainEvent } from '@/data/domain-events/queries';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { buildHoldingIndex, type HoldingIndex, parseCorpAssetItems } from '@/data/corp-holdings/placement';
import { saveHoldingNodes } from '@/data/corp-holdings/queries';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import {
  deleteEsiSnapshot,
  insertEsiSnapshot,
} from '@/data/esi-snapshots/queries';
import { snapshotRequestHash } from '@/data/esi-snapshots/request-hash';
import type { EsiSnapshotSource } from '@/data/esi-snapshots/types';
import { saveOwnedAssets } from '@/features/owned-assets/queries';
import type { OwnerKey } from '@/platform/owner-sync';

type AssetRows = Parameters<typeof saveOwnedAssets>[1];

export async function saveOwnedAssetsFromSource(
  owner: OwnerKey,
  rows: AssetRows,
  etags: string[],
  source: EsiSnapshotSource,
): Promise<void> {
  if (owner.ownerType === 'character') {
    await saveOwnedAssets(owner, rows, etags);
    return;
  }
  const items = parseCorpAssetItems(source.items);
  if (items === null) return;
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
  let outcome: 'saved' | 'superseded';
  try {
    outcome = await saveCorpHoldings(owner, buildHoldingIndex(items), rows, etags, snapshotId);
  } catch (error) {
    await discardSnapshot(snapshotId);
    throw error;
  }
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

/**
 * The tree of parents lands before the rows that resolve against it, so a
 * reader between the two writes sees missing parents and fails closed rather
 * than placing new rows against an older tree.
 */
async function saveCorpHoldings(
  owner: OwnerKey,
  index: HoldingIndex,
  rows: AssetRows,
  etags: string[],
  snapshotId: number,
): Promise<'saved' | 'superseded'> {
  const nodes = await saveHoldingNodes(owner.ownerId, index, new Date());
  if (nodes === 'superseded') return 'superseded';
  return saveOwnedAssets(owner, rows, etags, snapshotId);
}

async function discardSnapshot(snapshotId: number): Promise<void> {
  try {
    await deleteEsiSnapshot(snapshotId);
  } catch (cleanupError) {
    console.warn('[esi-snapshots] orphan cleanup failed', cleanupError);
  }
}
