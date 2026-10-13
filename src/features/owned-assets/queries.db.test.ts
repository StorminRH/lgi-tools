import { revalidateTag } from 'next/cache';
import { describe, expect, it, vi } from 'vitest';
import { countSessionsWaitingOn, createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { isUniqueViolation } from '@/db/pg-errors';
import { ownerKeyWhere } from '@/lib/db-columns';
import { listCharacterAssetSyncStates, saveOwnedAssets } from './queries';
import { ownedAssets, ownedAssetSyncs } from './schema';
import type { OwnedAsset } from './esi-projection';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_owned_assets',
  tables: ['owned_assets', 'owned_asset_syncs'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const owner = { ownerType: 'character', ownerId: 90001 } as const;

/** The ETags the save still writes beside the sync stamp; the response store, not this column, decides freshness. */
async function storedPageEtags(): Promise<string[] | undefined> {
  const [row] = await harness.db
    .select({ pageEtags: ownedAssetSyncs.pageEtags })
    .from(ownedAssetSyncs)
    .where(ownerKeyWhere(ownedAssetSyncs, owner));
  return row?.pageEtags;
}

function asset(overrides: Partial<OwnedAsset> = {}): OwnedAsset {
  return {
    type_id: 34,
    quantity: 100,
    location_id: 60003760,
    location_flag: 'Hangar',
    location_type: 'station',
    ...overrides,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    typeId: 34,
    quantity: 100,
    locationId: 60003760,
    locationFlag: 'Hangar',
    locationType: 'station',
    snapshotId: null,
    ...overrides,
  };
}

async function committedRows(): Promise<{ typeId: number; quantity: number }[]> {
  return harness.db
    .select({ typeId: ownedAssets.typeId, quantity: ownedAssets.quantity })
    .from(ownedAssets)
    .where(ownerKeyWhere(ownedAssets, owner));
}

async function committedRowCount(): Promise<number> {
  const rows = await harness.db
    .select({ id: ownedAssets.id })
    .from(ownedAssets)
    .where(ownerKeyWhere(ownedAssets, owner));
  return rows.length;
}

describe.skipIf(!harness.reachable)('owned-asset writes against Postgres', () => {
  it('returns saved and stores the aggregated set for a single writer, leaving the tag to the sync\'s commit', async () => {
    vi.mocked(revalidateTag).mockClear();
    const outcome = await saveOwnedAssets(owner, [asset(), asset({ type_id: 35 })], ['"etag"']);

    expect(outcome).toBe('saved');
    expect(await committedRowCount()).toBe(2);
    expect(await storedPageEtags()).toEqual(['"etag"']);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a direct duplicate of the natural key as a unique violation', async () => {
    await saveOwnedAssets(owner, [asset()], []);

    const error = await harness.db
      .insert(ownedAssets)
      .values(assetRow({ quantity: 999 }))
      .then(
        () => null,
        (rejection: unknown) => rejection,
      );

    expect(error).not.toBeNull();
    expect(isUniqueViolation(error)).toBe(true);
  });

  it('treats rows differing in any natural-key column as distinct', async () => {
    const outcome = await saveOwnedAssets(
      owner,
      [
        asset(),
        asset({ type_id: 35 }),
        asset({ location_id: 60003761 }),
        asset({ location_flag: 'CorpSAG1' }),
        asset({ location_type: 'item' }),
      ],
      [],
    );

    expect(outcome).toBe('saved');
    expect(await committedRowCount()).toBe(5);
  });

  it('queues a refresh behind an open one on the sync row, then commits its own rows and etags last', async () => {
    await saveOwnedAssets(owner, [asset({ type_id: 35 })], ['"first"']);
    vi.mocked(revalidateTag).mockClear();
    const blocker = await harness.sql.reserve();
    let loser: Promise<'saved' | 'superseded'> | undefined;
    try {
      // An open refresh: it holds the sync row and has replaced the rows, uncommitted.
      await blocker`BEGIN`;
      await blocker`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
      await blocker`
        UPDATE owned_asset_syncs SET page_etags = ${JSON.stringify(['"winner"'])}::jsonb
        WHERE owner_type = ${owner.ownerType} AND owner_id = ${owner.ownerId}
      `;
      await blocker`DELETE FROM owned_assets WHERE owner_type = ${owner.ownerType} AND owner_id = ${owner.ownerId}`;
      await blocker`
        INSERT INTO owned_assets
          (owner_type, owner_id, type_id, quantity, location_id, location_flag, location_type)
        VALUES
          (${owner.ownerType}, ${owner.ownerId}, 34, 100, 60003760, 'Hangar', 'station')
      `;
      const [holder] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;

      loser = saveOwnedAssets(owner, [asset({ quantity: 5 })], ['"loser"']);
      await expect.poll(() => countSessionsWaitingOn(harness.sql, holder!.pid), { timeout: 3_000, interval: 20 }).toBe(1);
      await blocker`COMMIT`;

      expect(await loser).toBe('saved');
      expect(await committedRows()).toEqual([{ typeId: 34, quantity: 5 }]);
      expect(await storedPageEtags()).toEqual(['"loser"']);
      expect(revalidateTag).not.toHaveBeenCalled();
    } finally {
      await blocker`ROLLBACK`;
      blocker.release();
      await loser;
    }
  });

  it('reports a unique violation as superseded and rolls the whole replace back', async () => {
    await saveOwnedAssets(owner, [asset({ type_id: 35 })], ['"kept"']);
    vi.mocked(revalidateTag).mockClear();

    expect(await saveOwnedAssets(owner, [asset(), asset()], ['"lost"'])).toBe('superseded');
    expect(await committedRows()).toEqual([{ typeId: 35, quantity: 100 }]);
    expect(await storedPageEtags()).toEqual(['"kept"']);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('stores an owner with more rows than one insert statement can bind', async () => {
    const rows = Array.from({ length: 9_000 }, (_, i) => asset({ type_id: i + 1 }));

    expect(await saveOwnedAssets(owner, rows, ['"large"'])).toBe('saved');
    expect(await committedRowCount()).toBe(9_000);
    expect(await storedPageEtags()).toEqual(['"large"']);
  });
});

describe.skipIf(!harness.reachable)('listCharacterAssetSyncStates against Postgres', () => {
  it('maps listed characters to their sync state and ignores a corporation sharing a numeric id', async () => {
    expect(await listCharacterAssetSyncStates([])).toEqual(new Map());

    const characterStamp = new Date('2026-09-27T11:58:00Z');
    const corpStamp = new Date('2026-09-28T00:00:00Z');
    await harness.db.insert(ownedAssetSyncs).values([
      { ownerType: 'character', ownerId: 90001, lastRefreshedAt: characterStamp, pageEtags: ['"p1"', '"p2"'] },
      { ownerType: 'corporation', ownerId: 90001, lastRefreshedAt: corpStamp, pageEtags: ['"corp"'] },
      { ownerType: 'corporation', ownerId: 90002, lastRefreshedAt: corpStamp, pageEtags: [] },
      { ownerType: 'character', ownerId: 90003, lastRefreshedAt: characterStamp, pageEtags: [] },
    ]);

    expect(await listCharacterAssetSyncStates([90001, 90002, 90003])).toEqual(new Map([
      [90001, { lastRefreshedAt: characterStamp }],
      [90003, { lastRefreshedAt: characterStamp }],
    ]));
  });
});
