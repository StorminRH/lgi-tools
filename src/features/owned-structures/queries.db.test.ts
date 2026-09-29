import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  getCorpStructureRigs,
  readCorpStructureSyncState,
  saveCorpStructures,
  upsertCorpStructureRigs,
} from './queries';
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
    await upsertCorpStructureRigs(corp, 600002, [37178, 37180], 1.5);
    await saveCorpStructures(corp, [], ['"e1"']);

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
});
