import { emitDomainEvent } from '@/data/domain-events/queries';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { buildHoldingIndex, parseCorpAssetItems } from '@/data/corp-holdings/placement';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { insertEsiSnapshot } from '@/data/esi-snapshots/queries';
import { snapshotRequestHash } from '@/data/esi-snapshots/request-hash';
import type { EsiSnapshotSource } from '@/data/esi-snapshots/types';
import type { OwnedAsset } from '@/features/owned-assets/esi-projection';
import { saveCorpOwnedAssets, saveOwnedAssets } from '@/features/owned-assets/queries';
import type { AnyPgDb } from '@/lib/db-types';
import type { OwnerKey, SaveOutcome } from '@/platform/owner-sync';

/**
 * Publishes an owner's assets on the transaction the sync's answers commit
 * in. A corporation's source body is kept as an encrypted snapshot on that
 * same transaction, so a publication that is superseded or fails takes its
 * snapshot with it. A body the holding index cannot read stores nothing,
 * and reports so, so the answer behind it is not recorded either.
 */
export async function saveOwnedAssetsFromSource(
  owner: OwnerKey,
  rows: OwnedAsset[],
  etags: string[],
  source: EsiSnapshotSource,
  tx: AnyPgDb,
): Promise<SaveOutcome> {
  if (owner.ownerType === 'character') return saveOwnedAssets(owner, rows, etags, tx);
  const items = parseCorpAssetItems(source.items);
  if (items === null) return 'superseded';
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
  }, tx);
  const outcome = await saveCorpOwnedAssets(owner.ownerId, buildHoldingIndex(items), rows, etags, snapshotId, { database: tx });
  if (outcome === 'saved') {
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
  return outcome;
}
