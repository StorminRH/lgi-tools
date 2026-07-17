import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import {
  getCorpStructureRigs,
  isCorpStructureSharingEnabled,
  readCorpStructureSharings,
  readCorpStructureSyncState,
  saveCorpStructures,
  setCorpStructureSharing,
  upsertCorpStructureRigs,
} from './queries';
import { corpStructureRigs, corpStructures, corpStructureSharing, corpStructureSyncs } from './schema';

// Exercises the corp-structure sharing-consent + authored-rig queries against the
// local Docker Postgres (postgres-js). The load-bearing guarantees this proves:
//   - sharing defaults OFF and the disable→wipe clears the corp's structures, sync
//     state, AND authored rigs (off ⇒ gone, sequentially — the request path is
//     neon-http, no transaction);
//   - the app-authored rigs SURVIVE the hourly full-replace pull (saveCorpStructures
//     never touches corp_structure_rigs).
// Skips cleanly when no DB is reachable. next/cache is mocked so the queries'
// revalidateTag is a no-op outside a request scope.
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
    'corp_structure_sharing',
    'corp_structure_rigs',
  ],
  steerDbProxy: true,
});

describe.skipIf(!harness.reachable)('corp-structure sharing + authored-rig queries against Postgres', () => {
  it('defaults sharing OFF for a corp with no row', async () => {
    expect(await isCorpStructureSharingEnabled(9001)).toBe(false);
    expect((await readCorpStructureSharings([9001])).size).toBe(0);
  });

  it('enables sharing (upsert) and reflects it in the read', async () => {
    await setCorpStructureSharing(9002, true, 42);
    expect(await isCorpStructureSharingEnabled(9002)).toBe(true);
    const sharings = await readCorpStructureSharings([9002]);
    expect(sharings.get(9002)?.enabled).toBe(true);
    expect(sharings.get(9002)?.setBy).toBe(42);
  });

  it('disable WIPES the corp structures, sync state, and authored rigs (off ⇒ gone)', async () => {
    const corp = 9003;
    // Seed a fully-populated, sharing-enabled corp.
    await harness.db.insert(corpStructureSharing).values({ corporationId: corp, enabled: true, setBy: 7 });
    await harness.db.insert(corpStructures).values({
      corporationId: corp,
      structureId: 600001,
      typeId: 35825,
      systemId: 30000142,
      securityClass: 'high',
      name: 'Raitaru A',
    });
    await harness.db.insert(corpStructureSyncs).values({ corporationId: corp, lastRefreshedAt: new Date(), pageEtags: [] });
    await harness.db.insert(corpStructureRigs).values({ corporationId: corp, structureId: 600001, rigTypeIds: [37178] });

    await setCorpStructureSharing(corp, false, 7);

    expect(await isCorpStructureSharingEnabled(corp)).toBe(false);
    expect(await readCorpStructureSyncState(corp)).toBeNull();
    expect((await getCorpStructureRigs([corp])).size).toBe(0);
    const remainingStructures = await harness.db
      .select()
      .from(corpStructures)
      .where(eq(corpStructures.corporationId, corp));
    expect(remainingStructures).toHaveLength(0);
  });

  it('authored completions SURVIVE the full-replace pull (saveCorpStructures never clobbers them)', async () => {
    const corp = 9004;
    await setCorpStructureSharing(corp, true, 11);
    // A pre-existing pulled structure + the structure-manager's authored completion.
    await harness.db.insert(corpStructures).values({
      corporationId: corp,
      structureId: 600002,
      typeId: 35825,
      systemId: 30000142,
      securityClass: 'high',
      name: 'Raitaru B (old)',
    });
    await upsertCorpStructureRigs(corp, 600002, [37178, 37180], 1.5);
    // The hourly full-replace pull rewrites the corp's structure set (here, to empty —
    // the delete path, which is the only destructive op and never touches the completion).
    await saveCorpStructures(corp, [], ['"e1"']);

    // The pulled structure rows were replaced, but the authored completion survives.
    const remaining = await harness.db.select().from(corpStructures).where(eq(corpStructures.corporationId, corp));
    expect(remaining).toHaveLength(0);
    expect((await getCorpStructureRigs([corp])).get(600002)).toEqual({
      rigTypeIds: [37178, 37180],
      taxPct: 1.5,
    });
  });

  it('upserts authored rigs (replace the set for one structure)', async () => {
    const corp = 9005;
    await setCorpStructureSharing(corp, true, 11);
    await upsertCorpStructureRigs(corp, 600003, [37178]);
    await upsertCorpStructureRigs(corp, 600003, [37180, 37182]);
    const rigs = await getCorpStructureRigs([corp]);
    expect(rigs.get(600003)).toEqual({ rigTypeIds: [37180, 37182], taxPct: null });
  });

  it('taxPct is tri-state: a rig-only save leaves the stored tax, null clears it, a number sets it', async () => {
    const corp = 9007;
    await setCorpStructureSharing(corp, true, 11);
    // Set a tax, then save rigs WITHOUT mentioning taxPct — the stored tax must survive
    // (the clobber guard: the corp completion editor may save rigs alone).
    await upsertCorpStructureRigs(corp, 600005, [37178], 2.5);
    await upsertCorpStructureRigs(corp, 600005, [37180]);
    expect((await getCorpStructureRigs([corp])).get(600005)).toEqual({
      rigTypeIds: [37180],
      taxPct: 2.5,
    });
    // An entered 0 is a real 0% rate, distinct from null.
    await upsertCorpStructureRigs(corp, 600005, [37180], 0);
    expect((await getCorpStructureRigs([corp])).get(600005)?.taxPct).toBe(0);
    // Explicit null clears back to never-entered.
    await upsertCorpStructureRigs(corp, 600005, [37180], null);
    expect((await getCorpStructureRigs([corp])).get(600005)?.taxPct).toBeNull();
  });

  it('saveCorpStructures no-ops when sharing is disabled (the resurrection guard)', async () => {
    const corp = 9006;
    // Sharing OFF (no row). A late write-behind save must not insert rows.
    await saveCorpStructures(corp, [{ structure_id: 600004, type_id: 35825, system_id: 30000142, name: 'Ghost' }], []);
    const rows = await harness.db.select().from(corpStructures).where(eq(corpStructures.corporationId, corp));
    expect(rows).toHaveLength(0);
    expect(await readCorpStructureSyncState(corp)).toBeNull();
  });
});
