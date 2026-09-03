import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { isUniqueViolation } from '@/db/pg-errors';
import { readOwnerSyncState, saveOwnedAssets } from './queries';
import { ownedAssets } from './schema';
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

async function committedRowCount(): Promise<number> {
  const rows = await harness.db
    .select({ id: ownedAssets.id })
    .from(ownedAssets)
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
  return rows.length;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe.skipIf(!harness.reachable)('owned-asset writes against Postgres', () => {
  it('returns saved and stores the aggregated set for a single writer', async () => {
    const outcome = await saveOwnedAssets(owner, [asset(), asset({ type_id: 35 })], ['"etag"']);

    expect(outcome).toBe('saved');
    expect(await committedRowCount()).toBe(2);
    expect((await readOwnerSyncState(owner))?.pageEtags).toEqual(['"etag"']);
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

  it('coalesces a refresh that loses the insert race to superseded, stamping nothing', async () => {

    await saveOwnedAssets(owner, [asset({ type_id: 35 })], ['"winner"']);

    let signalInserted!: () => void;
    let releaseWinner!: () => void;
    const winnerHasInserted = new Promise<void>((resolve) => {
      signalInserted = resolve;
    });
    const winnerMayCommit = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const winner = harness.sql.begin(async (tx) => {
      await tx`
        INSERT INTO owned_assets
          (owner_type, owner_id, type_id, quantity, location_id, location_flag, location_type)
        VALUES
          (${owner.ownerType}, ${owner.ownerId}, 34, 100, 60003760, 'Hangar', 'station')
      `;
      signalInserted();
      await winnerMayCommit;
    });

    await winnerHasInserted;

    const loser = saveOwnedAssets(owner, [asset()], ['"loser"']);

    await waitFor(async () => (await committedRowCount()) === 0);
    releaseWinner();
    await winner;

    expect(await loser).toBe('superseded');

    expect(await committedRowCount()).toBe(1);
    expect((await readOwnerSyncState(owner))?.pageEtags).toEqual(['"winner"']);
  });
});
