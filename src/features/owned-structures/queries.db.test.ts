import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { describe, expect, it, vi } from 'vitest';
import { eveSolarSystems } from '@/data/eve-data/schema';
import { countSessionsWaitingOn, createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  getCorpStructureRigs,
  readCorpStructureSyncState,
  saveCorpStructures,
  upsertCorpStructureRigs,
} from './queries';
import type { ParsedCorpStructure } from './esi-projection';
import { corpStructures } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_corp_structures_cov',
  tables: [
    'corp_structures',
    'corp_structure_syncs',
    'corp_structure_rigs',
    'eve_solar_systems',
  ],
  steerDbProxy: true,
});

function structure(structureId: number, typeId = 35825): ParsedCorpStructure {
  return { structure_id: structureId, type_id: typeId, system_id: 30000142, name: `Structure ${structureId}` };
}

async function storedStructureIds(corporationId: number): Promise<number[]> {
  const rows = await harness.db
    .select({ structureId: corpStructures.structureId })
    .from(corpStructures)
    .where(eq(corpStructures.corporationId, corporationId))
    .orderBy(corpStructures.structureId);
  return rows.map((row) => row.structureId);
}

describe.skipIf(!harness.reachable)('corp-structure and authored-rig queries against Postgres', () => {
  it('authored completions SURVIVE the full-replace pull (saveCorpStructures never clobbers them)', async () => {
    const corp = 9004;
    await harness.db.insert(corpStructures).values({
      corporationId: corp,
      structureId: 600002,
      typeId: 35825,
      systemId: 30000142,
      securityClass: 'high',
      name: 'Raitaru B (old)',
    });
    vi.mocked(revalidateTag).mockClear();
    await upsertCorpStructureRigs(corp, 600002, [37178, 37180], 1.5);
    expect(revalidateTag).not.toHaveBeenCalled();
    await saveCorpStructures(corp, [], ['"e1"']);
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('corp-structures:9004', { expire: 0 });

    const remaining = await harness.db.select().from(corpStructures).where(eq(corpStructures.corporationId, corp));
    expect(remaining).toHaveLength(0);
    expect((await getCorpStructureRigs([corp])).get(600002)).toEqual({
      rigTypeIds: [37178, 37180],
      taxPct: 1.5,
    });
  });

  it('upserts authored rigs (replace the set for one structure)', async () => {
    const corp = 9005;
    await upsertCorpStructureRigs(corp, 600003, [37178]);
    await upsertCorpStructureRigs(corp, 600003, [37180, 37182]);
    const rigs = await getCorpStructureRigs([corp]);
    expect(rigs.get(600003)).toEqual({ rigTypeIds: [37180, 37182], taxPct: null });
  });

  it('taxPct is tri-state: a rig-only save leaves the stored tax, null clears it, a number sets it', async () => {
    const corp = 9007;
    await upsertCorpStructureRigs(corp, 600005, [37178], 2.5);
    await upsertCorpStructureRigs(corp, 600005, [37180]);
    expect((await getCorpStructureRigs([corp])).get(600005)).toEqual({
      rigTypeIds: [37180],
      taxPct: 2.5,
    });
    await upsertCorpStructureRigs(corp, 600005, [37180], 0);
    expect((await getCorpStructureRigs([corp])).get(600005)?.taxPct).toBe(0);
    await upsertCorpStructureRigs(corp, 600005, [37180], null);
    expect((await getCorpStructureRigs([corp])).get(600005)?.taxPct).toBeNull();
  });

  it('saves the corp structures whether or not sharing is on', async () => {
    const corp = 9006;
    await saveCorpStructures(corp, [{ structure_id: 600004, type_id: 35825, system_id: 30000142, name: 'Fort' }], ['"s1"']);
    const rows = await harness.db
      .select({ structureId: corpStructures.structureId, name: corpStructures.name })
      .from(corpStructures)
      .where(eq(corpStructures.corporationId, corp));
    expect(rows).toEqual([{ structureId: 600004, name: 'Fort' }]);
    expect((await readCorpStructureSyncState(corp))?.pageEtags).toEqual(['"s1"']);
  });

  it('stores each structure under its system’s security class, high when the system is unknown', async () => {
    const corp = 9008;
    await harness.db.insert(eveSolarSystems).values([
      { id: 30002813, constellationId: 1, regionId: 1, name: 'Tama', securityStatus: 0.282556 },
      { id: 31000123, constellationId: 1, regionId: 1, name: 'J100820', securityStatus: -0.99, wormholeClassId: 3 },
    ]);
    await saveCorpStructures(
      corp,
      [
        { structure_id: 600010, type_id: 35825, system_id: 30002813, name: 'Tama Raitaru' },
        { structure_id: 600011, type_id: 35825, system_id: 31000123, name: 'Hole Raitaru' },
        { structure_id: 600012, type_id: 35825, system_id: 30099999, name: 'Unsurveyed Raitaru' },
        { structure_id: 600013, type_id: 35832, system_id: 30002813, name: 'Tama Azbel' },
      ],
      ['"c1"'],
    );
    const rows = await harness.db
      .select({ structureId: corpStructures.structureId, securityClass: corpStructures.securityClass })
      .from(corpStructures)
      .where(eq(corpStructures.corporationId, corp))
      .orderBy(corpStructures.structureId);
    expect(rows).toEqual([
      { structureId: 600010, securityClass: 'low' },
      { structureId: 600011, securityClass: 'wormhole' },
      { structureId: 600012, securityClass: 'high' },
      { structureId: 600013, securityClass: 'low' },
    ]);
  });

  it('queues concurrent refreshes behind the sync row, so the final rows match the final etags', async () => {
    const corp = 9009;
    await saveCorpStructures(corp, [structure(600020)], ['"before"']);
    const blocker = await harness.sql.reserve();
    let saves: Promise<void[]> | undefined;
    try {
      await blocker`BEGIN`;
      await blocker`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
      await blocker`SELECT 1 FROM corp_structure_syncs WHERE corporation_id = ${corp} FOR UPDATE`;
      const [holder] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      saves = Promise.all([
        saveCorpStructures(corp, [structure(600021)], ['"one"']),
        saveCorpStructures(corp, [structure(600022)], ['"two"']),
      ]);
      await expect.poll(() => countSessionsWaitingOn(harness.sql, holder!.pid), { timeout: 3_000, interval: 20 }).toBe(2);
      expect(await storedStructureIds(corp)).toEqual([600020]);
      await blocker`COMMIT`;
      await saves;
      const [finalId, ...rest] = await storedStructureIds(corp);
      expect(rest).toEqual([]);
      expect((await readCorpStructureSyncState(corp))?.pageEtags).toEqual([finalId === 600021 ? '"one"' : '"two"']);
    } finally {
      await blocker`ROLLBACK`;
      blocker.release();
      await saves;
    }
  });

  it('rolls a failed insert back, so the prior rows and etags survive and nothing is invalidated', async () => {
    const corp = 9010;
    await saveCorpStructures(corp, [structure(600030)], ['"kept"']);
    await harness.sql`ALTER TABLE corp_structures ADD CONSTRAINT reject_test_type CHECK (type_id <> 99)`;
    try {
      vi.mocked(revalidateTag).mockClear();
      await expect(saveCorpStructures(corp, [structure(600031, 99)], ['"lost"'])).rejects.toThrow();
      expect(await storedStructureIds(corp)).toEqual([600030]);
      expect((await readCorpStructureSyncState(corp))?.pageEtags).toEqual(['"kept"']);
      expect(revalidateTag).not.toHaveBeenCalled();
    } finally {
      await harness.sql`ALTER TABLE corp_structures DROP CONSTRAINT reject_test_type`;
    }
  });
});
