import { describe, expect, it, vi } from 'vitest';
import { domainEvents } from '@/data/domain-events/schema';
import { commitWithWrite } from '@/data/esi-store';
import { esiSnapshots } from '@/data/esi-snapshots/schema';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { ownedAssetsKey } from '@/features/owned-assets/keys';
import { ownedAssets } from '@/features/owned-assets/schema';
import type { AnyPgDb } from '@/lib/db-types';
import { saveOwnedAssetsFromSource } from './owned-assets-source-save';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

/** Work handed to after(), run once the test asks: an event scheduled there would land despite a rollback. */
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock('next/server', () => ({ after: (task: () => unknown) => afterTasks.push(task) }));

async function runAfterTasks(): Promise<void> {
  await Promise.all(afterTasks.splice(0).map((task) => task()));
}

const harness = await createDbTestHarness({
  schema: 'test_owned_assets_source_save',
  tables: ['esi_snapshots', 'corp_holding_nodes', 'owned_assets', 'owned_asset_syncs', 'esi_responses', 'domain_events'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
  env: { ESI_SNAPSHOT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
});

const CORP = 98000001;
const owner = { ownerType: 'corporation', ownerId: CORP } as const;
const rows = [{ type_id: 34, quantity: 12, location_id: 101, location_type: 'item', location_flag: 'CorpSAG1' }];
const source = {
  endpoint: '/corporations/98000001/assets/',
  items: [
    { item_id: 101, type_id: 27, quantity: 1, location_id: 60003760, location_type: 'station', location_flag: 'OfficeFolder' },
    { item_id: 102, type_id: 34, quantity: 12, location_id: 101, location_type: 'item', location_flag: 'CorpSAG1' },
  ],
  responseHeaders: [],
};

/** One corp assets answer, committed with the save the way an owner sync's session commits it. */
function commitSave(run: (tx: AnyPgDb) => Promise<'saved' | 'superseded'>) {
  return commitWithWrite(
    [{ key: ownedAssetsKey(owner), expiresAt: Date.now() + 60_000, etags: ['"a"'], lastModified: null, checkedAt: Date.now() }],
    { kind: 'transaction', run },
  );
}

const save = (tx: AnyPgDb) => saveOwnedAssetsFromSource(owner, rows, ['"a"'], source, tx);

describe.skipIf(!harness.reachable)('corp asset publication and its snapshot event', () => {
  it('writes no esi_snapshot_pulled event when the commit fails after the save', async () => {
    await expect(commitSave(async (tx) => {
      await save(tx);
      throw new Error('commit failed');
    })).rejects.toThrow('commit failed');
    await runAfterTasks();

    expect(await harness.db.select().from(esiSnapshots)).toEqual([]);
    expect(await harness.db.select().from(ownedAssets)).toEqual([]);
    expect(await harness.db.select().from(domainEvents)).toEqual([]);
  });

  it('writes exactly one event, naming the stored snapshot, when the commit stands', async () => {
    await expect(commitSave(save)).resolves.toBe('saved');
    await runAfterTasks();

    const [snapshot] = await harness.db.select({ id: esiSnapshots.id }).from(esiSnapshots);
    const events = await harness.db.select().from(domainEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'esi_snapshot_pulled',
      metadata: { snapshotId: snapshot!.id, dataset: 'owned_assets', ownerType: 'corporation', ownerId: CORP, itemCount: 2 },
    });
  });
});
