import { expect, test, vi } from 'vitest';
import type { PostgresJsDb } from '@/lib/db-types';

const mocks = vi.hoisted(() => ({
  runIngest: vi.fn(),
  resolveAllTrees: vi.fn(),
  listTrackedTypeIds: vi.fn(),
  listMissingTypeIds: vi.fn(),
  seedPlaceholderPrices: vi.fn(),
  resolveNpcStationNames: vi.fn(),
}));

vi.mock('@/data/eve-data/ingest', () => ({ runIngest: mocks.runIngest }));
vi.mock('@/data/eve-data/tree-resolver', () => ({ resolveAllTrees: mocks.resolveAllTrees }));
vi.mock('@/data/eve-data/queries', () => ({ listTrackedTypeIds: mocks.listTrackedTypeIds }));
vi.mock('@/data/eve-data/station-names', () => ({ resolveNpcStationNames: mocks.resolveNpcStationNames }));
vi.mock('@/data/market-prices/queries', () => ({ listMissingTypeIds: mocks.listMissingTypeIds }));
vi.mock('@/data/market-prices/ingest', () => ({ seedPlaceholderPrices: mocks.seedPlaceholderPrices }));

import { runSdePipeline } from './sde-pipeline';

test('seeds placeholder prices for the ingested tracked types that have no price row', async () => {
  const db = {} as PostgresJsDb;
  const ingest = { typesWritten: 3 };
  const resolve = { blueprintsResolved: 2, skipped: false };
  mocks.runIngest.mockResolvedValue(ingest);
  mocks.resolveAllTrees.mockResolvedValue(resolve);
  mocks.listTrackedTypeIds.mockResolvedValue([34, 35, 36]);
  mocks.listMissingTypeIds.mockResolvedValue([35, 36]);
  // Another writer seeded type 36 between the missing-row read and the insert.
  mocks.seedPlaceholderPrices.mockResolvedValue(1);
  mocks.resolveNpcStationNames.mockResolvedValue({ resolved: 4 });

  await expect(runSdePipeline(db)).resolves.toEqual({
    ingest,
    resolve,
    seed: { tracked: 3, missing: 2, inserted: 1 },
    stationNames: { resolved: 4 },
    durationMs: expect.any(Number),
  });

  expect(mocks.listMissingTypeIds).toHaveBeenCalledWith(db, [34, 35, 36]);
  expect(mocks.seedPlaceholderPrices).toHaveBeenCalledWith(db, [35, 36]);
  expect(mocks.runIngest.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.listTrackedTypeIds.mock.invocationCallOrder[0]!,
  );
});
