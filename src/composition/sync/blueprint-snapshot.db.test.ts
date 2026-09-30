import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import { buildHoldingIndex, parseCorpAssetItems } from '@/data/corp-holdings/placement';
import { encryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { insertEsiSnapshot } from '@/data/esi-snapshots/queries';
import { getCorpAssetEvidence, saveCorpOwnedAssets } from '@/features/owned-assets/queries';
import { compileCorpGrant, compileReadScope } from '@/platform/auth/corp-visibility';
import type { CorpRole } from '@/platform/auth/corp-roles';
import { getOwnedBlueprintMap, readBlueprintSyncState, saveOwnedBlueprints } from '@/features/owned-blueprints/queries';
import { ownedBlueprints } from '@/features/owned-blueprints/schema';
import type { OwnedBlueprint } from '@/features/owned-blueprints/esi-projection';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
const harness = await createDbTestHarness({
  schema: 'test_blueprint_asset_evidence',
  tables: ['esi_snapshots', 'corp_holding_nodes', 'owned_assets', 'owned_asset_syncs', 'owned_blueprints', 'owned_blueprint_syncs'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
  env: { ESI_SNAPSHOT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
});
const CORP = 98000001;
const STATION = 60003760;
const CAN = 3001;
const BLUEPRINT = 4001;
const owner = { ownerType: 'corporation', ownerId: CORP } as const;
const blueprint: OwnedBlueprint = {
  item_id: BLUEPRINT, type_id: 34, material_efficiency: 10, time_efficiency: 20,
  quantity: -1, runs: -1, location_id: CAN, location_flag: 'Unlocked',
};

async function publishAssets(division: number, includeBlueprint = true, overrides: Record<string, unknown> = {}) {
  const raw = [
    { item_id: CAN, type_id: 17366, quantity: 1, location_id: STATION, location_type: 'station', location_flag: `CorpSAG${division}` },
    ...(includeBlueprint ? [{ item_id: BLUEPRINT, type_id: 34, quantity: 1, location_id: CAN, location_type: 'item', location_flag: 'Unlocked', ...overrides }] : []),
  ];
  const id = await insertEsiSnapshot({
    ...owner, endpoint: `/corporations/${CORP}/assets/`, requestHash: 'test', etag: null,
    responseHeaders: [], fetchedAt: new Date(), sourceVersion: 'test', bodyCiphertext: encryptSnapshotBody(raw),
  });
  await saveCorpOwnedAssets(CORP, buildHoldingIndex(parseCorpAssetItems(raw)!), [{
    type_id: 17366, quantity: 1, location_id: STATION, location_type: 'station', location_flag: `CorpSAG${division}`,
  }], [], id, { database: harness.db });
}
function save(rows: OwnedBlueprint[] = [blueprint], etags = ['before']) {
  return saveOwnedBlueprints(owner, rows, etags, { database: harness.db });
}
async function read(roles: CorpRole[] = ['Hangar_Query_1']) {
  const scope = compileReadScope([], [compileCorpGrant({
    corporationId: CORP, sharing: 'on', context: buildCorpHoldingContext(CORP, [], null),
    members: [{ characterId: 90001, base: { kind: 'known', value: null }, roles: { kind: 'known', roles: {
      global: new Set(roles), atHq: new Set(), atBase: new Set(), atOther: new Set(),
    } } }],
  })]);
  return getOwnedBlueprintMap(scope, new Map([[CORP, await getCorpAssetEvidence(CORP)]]));
}

describe.skipIf(!harness.reachable)('blueprint identity and immutable asset placement', () => {
  it('does not expose a removed blueprint when its former container moves to an allowed division', async () => {
    await publishAssets(2);
    await save();
    expect((await read(['Hangar_Query_2'])).get(34)?.me).toBe(10);
    await publishAssets(1, false);
    expect(await read()).toEqual(new Map());
  });

  it('allows an exact blueprint still inside the moved container using its source placement', async () => {
    await publishAssets(2);
    await save();
    await publishAssets(1);
    expect((await read()).get(34)).toMatchObject({ me: 10, placement: { kind: 'hangar', division: 1 } });
    expect(await read(['Hangar_Query_2'])).toEqual(new Map());
  });

  it.each([
    { item_id: BLUEPRINT + 1 }, { type_id: 35 }, { location_id: CAN + 1 }, { location_flag: 'Locked' },
  ])('withholds nonmatching asset identity or location %j', async (overrides) => {
    await publishAssets(1, true, overrides);
    await save();
    expect(await read()).toEqual(new Map());
  });

  it('withholds legacy rows for scoped members but preserves whole-corporation grants', async () => {
    await publishAssets(1);
    await save();
    await harness.sql`UPDATE owned_blueprints SET item_id = NULL`;
    expect(await read()).toEqual(new Map());
    expect((await read(['Factory_Manager'])).get(34)?.me).toBe(10);
  });

  it('withholds missing or partly unproven asset publication evidence', async () => {
    await save();
    expect(await read()).toEqual(new Map());
    await publishAssets(1);
    await harness.sql`INSERT INTO owned_assets (owner_type, owner_id, type_id, quantity, location_id, location_flag, location_type) VALUES ('corporation', ${CORP}, 99, 1, ${STATION}, 'CorpSAG1', 'station')`;
    expect(await read()).toEqual(new Map());
  });

  it('refuses evidence assembled from multiple published asset generations', async () => {
    await publishAssets(2);
    await save();
    const [old] = await harness.sql<{ snapshot_id: number }[]>`SELECT snapshot_id FROM owned_assets LIMIT 1`;
    await publishAssets(1);
    await harness.sql`INSERT INTO owned_assets (owner_type, owner_id, type_id, quantity, location_id, location_flag, location_type, snapshot_id) VALUES ('corporation', ${CORP}, 99, 1, ${STATION}, 'CorpSAG1', 'station', ${old!.snapshot_id})`;
    expect(await getCorpAssetEvidence(CORP)).toBeNull();
    expect(await read()).toEqual(new Map());
  });

  it('rolls back identity, metadata and sync state when replacement fails', async () => {
    await save();
    await harness.sql`ALTER TABLE owned_blueprints ADD CONSTRAINT reject_me CHECK (material_efficiency <> 99)`;
    try {
      await expect(save([{ ...blueprint, item_id: BLUEPRINT + 1, material_efficiency: 99 }], ['after'])).rejects.toThrow();
      expect((await harness.db.select().from(ownedBlueprints)).map((row) => [row.itemId, row.materialEfficiency])).toEqual([[BLUEPRINT, 10]]);
      expect((await readBlueprintSyncState(owner))?.pageEtags).toEqual(['before']);
    } finally {
      await harness.sql`ALTER TABLE owned_blueprints DROP CONSTRAINT reject_me`;
    }
  });

  it('serializes concurrent replacements so metadata, identity and etags describe one publication', async () => {
    await Promise.all([
      save([{ ...blueprint, item_id: 5001, material_efficiency: 1 }], ['one']),
      save([{ ...blueprint, item_id: 5002, material_efficiency: 2 }], ['two']),
    ]);
    const rows = await harness.db.select().from(ownedBlueprints);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.itemId).toBe(5000 + rows[0]!.materialEfficiency);
    expect((await readBlueprintSyncState(owner))?.pageEtags).toEqual([rows[0]!.itemId === 5001 ? 'one' : 'two']);
  });
});
