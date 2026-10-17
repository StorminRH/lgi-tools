import { beforeEach, expect, test, vi } from 'vitest';

const { chain, state, reset } = await vi.hoisted(async () => {
  const { createFakeQueryChain } = await import('@/db/__tests__/support/fake-query-chain');
  return createFakeQueryChain();
});

const h = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  storedExpiry: vi.fn(),
}));

vi.mock('@/db', () => ({ db: chain }));
vi.mock('next/cache', () => ({ cacheLife: h.cacheLife, cacheTag: h.cacheTag }));
vi.mock('@/data/esi-store', async () => ({
  ...(await vi.importActual<typeof import('@/data/esi-store/expiry')>('@/data/esi-store/expiry')),
  storedExpiry: h.storedExpiry,
}));

import {
  getAdjustedPrices,
  getAveragePrices,
  getSystemCostIndicesBatch,
} from './queries';

const NOW = Date.parse('2026-10-12T12:00:00Z');

beforeEach(() => {
  reset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.storedExpiry.mockReset().mockResolvedValue(NOW + 1_800_000);
});

test('getSystemCostIndicesBatch reads each system once under the dataset tag, cached until the cost index document expires', async () => {
  expect((await getSystemCostIndicesBatch([])).size).toBe(0);
  expect(state.calls.select).toBe(0);

  state.results = [
    [
      { activity: 'manufacturing', costIndex: 0.05 },
      { activity: 'reaction', costIndex: 0.06 },
    ],
    [{ activity: 'manufacturing', costIndex: 0.1 }],
  ];
  const out = await getSystemCostIndicesBatch([30000142, 30000144, 30000142]);
  expect(out.get(30000142)?.get('manufacturing')).toBe(0.05);
  expect(out.get(30000142)?.get('reaction')).toBe(0.06);
  expect(out.get(30000144)?.get('manufacturing')).toBe(0.1);
  expect(state.calls.select).toBe(2);
  expect(h.cacheTag.mock.calls).toEqual([['eve:industry_indices'], ['eve:industry_indices']]);
  expect(h.storedExpiry).toHaveBeenCalledWith([{ route: '/industry/systems/', holder: { kind: 'global' } }]);
  expect(h.cacheLife).toHaveBeenCalledWith({ stale: 1800, revalidate: 1800, expire: 1800 });

  // A system with no stored indices is left out, and lives one second while the document is due.
  reset();
  h.cacheLife.mockReset();
  state.results = [[]];
  h.storedExpiry.mockResolvedValue(null);
  expect((await getSystemCostIndicesBatch([1])).size).toBe(0);
  expect(h.cacheLife).toHaveBeenCalledWith({ stale: 1, revalidate: 1, expire: 1 });
});

test('the price reads build Map<typeId, price>, keeping 0 and skipping NULL-priced rows', async () => {
  state.results = [[
    { typeId: 34, price: 2.9 },
    { typeId: 41, price: 0 },
    { typeId: 99, price: null },
  ]];
  expect(await getAdjustedPrices([34, 41, 99])).toEqual(new Map([[34, 2.9], [41, 0]]));

  reset();
  state.results = [[
    { typeId: 44992, price: 4_690_000 },
    { typeId: 34, price: 3.1 },
    { typeId: 99, price: null },
  ]];
  expect(await getAveragePrices([44992, 34, 99])).toEqual(new Map([[44992, 4_690_000], [34, 3.1]]));
  expect((await getAveragePrices([])).size).toBe(0);
  expect(state.calls.select).toBe(1);
});
