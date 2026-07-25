import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { isUniqueViolation } from '@/db/pg-errors';
import { readOwnerSyncState, saveOwnedAssets } from './queries';
import { ownedAssets } from './schema';
import type { OwnedAsset } from './esi-projection';

// Proves the owned_assets natural-key unique index (migration 0050) against the
// REAL local Docker Postgres. The load-bearing claim is a concurrency one that a
// mocked driver cannot prove: the replace-all refresh runs delete → insert →
// stamp with NO transaction (the request path is neon-http), so two refreshes for
// one owner can interleave and double the ledger the industry planner sums. The
// unique index is the only atomic guard available, and saveOwnedAssets coalesces
// the loser's unique violation into 'superseded' rather than failing the refresh.
//
// Run `pnpm db:migrate` first: the harness clones the migrated public schema with
// `LIKE ... INCLUDING ALL`, so an un-migrated database would clone a table with no
// constraint and these tests would silently prove nothing. Skips cleanly when no
// Postgres answers. next/cache is mocked so revalidateTag is a no-op outside a
// request scope.
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

/** Rows this owner has COMMITTED, read on a connection separate from any open transaction. */
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

    // Asserted through the shared classifier rather than a literal error shape:
    // Drizzle wraps the driver error, and the classifier unwrapping that chain
    // correctly is exactly what the 'superseded' coalesce depends on.
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
    // Establish the baseline the loser will delete, with an etag we can watch.
    await saveOwnedAssets(owner, [asset()], ['"winner"']);

    // A concurrent refresh that has inserted its row but not yet committed. It
    // holds the natural key, so the loser's own insert must block on it.
    let releaseWinner!: () => void;
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
      await winnerMayCommit;
    });

    const loser = saveOwnedAssets(owner, [asset()], ['"loser"']);
    // The loser's DELETE removes the committed baseline but cannot see the
    // winner's uncommitted row; once the committed set is empty its INSERT has
    // been issued and is blocked on the winner's key.
    await waitFor(async () => (await committedRowCount()) === 0);
    releaseWinner();
    await winner;

    expect(await loser).toBe('superseded');
    // The winner's row is the single survivor, and the loser stamped nothing.
    expect(await committedRowCount()).toBe(1);
    expect((await readOwnerSyncState(owner))?.pageEtags).toEqual(['"winner"']);
  });
});
