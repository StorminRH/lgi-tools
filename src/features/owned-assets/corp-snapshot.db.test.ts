import { revalidateTag } from 'next/cache';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import { buildHoldingIndex, parseCorpAssetItems, toHoldingNodes } from '@/data/corp-holdings/placement';
import { corpHoldingNodes } from '@/data/corp-holdings/schema';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { insertEsiSnapshot } from '@/data/esi-snapshots/queries';
import { compileCorpGrant, compileReadScope } from '@/platform/auth/corp-visibility';
import { ownedResourcePath } from '@/platform/owner-sync';
import { ownedDatasetPortFake, ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { getCorpAssetEvidence, getOwnedAssetMap, readOwnerSyncState, saveCorpOwnedAssets } from './queries';
import { OWNED_ASSETS_RESOURCE, refreshOwnedAssetsForUser } from './refresh';
import { ownedAssets } from './schema';
import type { OwnedAssetsPort } from './types';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

const harness = await createDbTestHarness({
  schema: 'test_corp_asset_snapshot',
  tables: ['esi_snapshots', 'corp_holding_nodes', 'owned_assets', 'owned_asset_syncs'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
  env: { ESI_SNAPSHOT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
});
const CORP = 98000001;
const STATION = 60003760;
const CAN = 3001;
const owner = { ownerType: 'corporation', ownerId: CORP } as const;

/** The ETags the save still writes beside the sync stamp; the response store, not this column, decides freshness. */
async function storedPageEtags(): Promise<string[] | undefined> {
  const [row] = await harness.sql<{ page_etags: string[] }[]>`
    SELECT page_etags FROM owned_asset_syncs WHERE owner_type = 'corporation' AND owner_id = ${CORP}`;
  return row?.page_etags;
}

function source(division: number, quantity: number) {
  return [
    { item_id: CAN, type_id: 17366, quantity: 1, location_id: STATION, location_type: 'station', location_flag: `CorpSAG${division}` },
    ...(quantity === 0 ? [] : [{ item_id: 4001, type_id: 34, quantity, location_id: CAN, location_type: 'item', location_flag: 'Unlocked' }]),
  ];
}
function index(division: number, quantity = 100) {
  return buildHoldingIndex(parseCorpAssetItems(source(division, quantity))!);
}
async function snapshot(division: number, quantity: number, endpoint = ownedResourcePath(OWNED_ASSETS_RESOURCE, owner)) {
  return insertEsiSnapshot({
    ...owner, endpoint, requestHash: 'test', etag: null,
    responseHeaders: [], fetchedAt: new Date(), sourceVersion: 'test',
    bodyCiphertext: encryptSnapshotBody(source(division, quantity)),
  });
}
async function save(division: number, quantity: number, id: number) {
  return saveCorpOwnedAssets(CORP, index(division, quantity), quantity === 0 ? [] : [{
    type_id: 34, quantity, location_id: CAN, location_type: 'item', location_flag: 'Unlocked',
  }], [`division-${division}`], id, { database: harness.db });
}
/** The endpoint a Director's corporation assets sync hands to the save, read through the real descriptor. */
async function syncedEndpoint(): Promise<string> {
  const saveSource = vi.fn<OwnedAssetsPort['save']>(async () => {});
  await refreshOwnedAssetsForUser(ownedDatasetPortFake(new Date(), {
    listCharacters: async () => [ownerFixture(90001, { corporationId: CORP })],
    readRoles: async () => ['Director'],
    read: async () => ({ kind: 'fresh', items: source(1, 25), etags: [], responseHeaders: [] }),
    save: saveSource,
  }), 'user-1');
  const corpSave = saveSource.mock.calls.find(([saved]) => saved.ownerType === 'corporation');
  if (corpSave === undefined) throw new Error('the corporation pass saved nothing');
  return corpSave[3].endpoint;
}
function scope(contextDivision: number, allowedDivision: 1 | 2 = 1) {
  const grant = compileCorpGrant({
    corporationId: CORP, sharing: 'on',
    context: buildCorpHoldingContext(CORP, toHoldingNodes(index(contextDivision)), null),
    members: [{ characterId: 90001, base: { kind: 'known', value: null }, roles: { kind: 'known', roles: {
      global: new Set([`Hangar_Query_${allowedDivision}` as const]),
      atHq: new Set(), atBase: new Set(), atOther: new Set(),
    } } }],
  });
  return compileReadScope([], [grant]);
}

describe.skipIf(!harness.reachable)('corporation asset publication and authorization snapshots', () => {
  it('never authorizes old restricted contents using a newly moved container from the viewer cache', async () => {
    await save(2, 100, await snapshot(2, 100));
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
    expect((await getOwnedAssetMap(scope(1, 2), [34])).get(34)?.ownedQty).toBe(100);
  });

  it('uses the new content placement even if the viewer cache still has the old index', async () => {
    await save(1, 25, await snapshot(1, 25));
    expect((await getOwnedAssetMap(scope(2), [34])).get(34)?.ownedQty).toBe(25);
    expect(await getOwnedAssetMap(scope(2, 2), [34])).toEqual(new Map());
  });

  it('rolls back nodes, contents and sync state if the content insert fails, and expires the corp tags only on commit', async () => {
    const before = await snapshot(2, 100);
    vi.mocked(revalidateTag).mockClear();
    await save(2, 100, before);
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ['corp-holdings:98000001', { expire: 0 }],
      ['owned-assets:corporation:98000001', { expire: 0 }],
    ]);
    const oldNodes = await harness.db.select().from(corpHoldingNodes);
    await harness.sql`ALTER TABLE owned_assets ADD CONSTRAINT reject_quantity CHECK (quantity <> 999)`;
    try {
      const failed = await snapshot(1, 999);
      vi.mocked(revalidateTag).mockClear();
      await expect(save(1, 999, failed)).rejects.toThrow();
      expect(revalidateTag).not.toHaveBeenCalled();
      expect(await harness.db.select().from(corpHoldingNodes)).toEqual(oldNodes);
      expect((await harness.db.select().from(ownedAssets)).map((row) => [row.quantity, row.snapshotId])).toEqual([[100, before]]);
      expect(await storedPageEtags()).toEqual(['division-2']);
      expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
    } finally {
      await harness.sql`ALTER TABLE owned_assets DROP CONSTRAINT reject_quantity`;
    }
  });

  it('serializes simultaneous refreshes into one complete content and index pair', async () => {
    const first = await snapshot(1, 11);
    const second = await snapshot(2, 22);
    await Promise.all([save(1, 11, first), save(2, 22, second)]);
    const rows = await harness.db.select().from(ownedAssets);
    expect(rows).toHaveLength(1);
    const division = rows[0]!.snapshotId === first ? 1 : 2;
    const nodes = await harness.db.select().from(corpHoldingNodes);
    expect(nodes.find((node) => node.itemId === CAN)?.division).toBe(division);
    expect(await storedPageEtags()).toEqual([`division-${division}`]);
    expect(rows[0]!.quantity).toBe(division * 11);
  });

  it('stamps the sync row with the new etags and refresh time on every publication', async () => {
    await save(2, 100, await snapshot(2, 100));
    await harness.sql`UPDATE owned_asset_syncs SET last_refreshed_at = '2000-01-01T00:00:00Z'`;
    const before = Date.now();
    await save(1, 25, await snapshot(1, 25));
    expect(await storedPageEtags()).toEqual(['division-1']);
    expect((await readOwnerSyncState(owner))?.lastRefreshedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('publishes an empty content set together with the moved container', async () => {
    await save(2, 100, await snapshot(2, 100));
    await save(1, 0, await snapshot(1, 0));
    expect(await harness.db.select().from(ownedAssets)).toEqual([]);
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
  });

  it('withholds legacy rows without source provenance', async () => {
    await save(1, 25, await snapshot(1, 25));
    await harness.sql`UPDATE owned_assets SET snapshot_id = NULL`;
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
  });

  it('reads back the snapshot stored under the endpoint the corporation sync emits', async () => {
    await save(1, 25, await snapshot(1, 25, await syncedEndpoint()));
    expect(await getCorpAssetEvidence(CORP)).toMatchObject({ corporationId: CORP });
    expect((await getOwnedAssetMap(scope(1), [34])).get(34)?.ownedQty).toBe(25);
  });

  it('withholds snapshots belonging to another corporation or endpoint', async () => {
    await save(1, 25, await snapshot(1, 25));
    await harness.sql`UPDATE esi_snapshots SET owner_id = ${CORP + 1}`;
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
    await harness.sql`UPDATE esi_snapshots SET owner_id = ${CORP}, endpoint = '/wrong-endpoint/'`;
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
  });

  it('withholds malformed or undecryptable snapshot bodies', async () => {
    await save(1, 25, await snapshot(1, 25));
    await harness.sql`UPDATE esi_snapshots SET body_ciphertext = 'invalid'`;
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
    const invalidBody = encryptSnapshotBody([{ wrong: true }]);
    await harness.sql`UPDATE esi_snapshots SET body_ciphertext = ${invalidBody}`;
    expect(await getOwnedAssetMap(scope(1), [34])).toEqual(new Map());
  });

});
