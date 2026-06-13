import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiServerError } from '@/lib/esi';
import { UPSERT_CHUNK_SIZE } from './constants';
import type { RawAdjustedPrice, RawCostIndex } from './types';

const fetchCostIndicesMock = vi.fn();
const fetchAdjustedPricesMock = vi.fn();

vi.mock('./source', () => ({
  fetchCostIndices: () => fetchCostIndicesMock(),
  fetchAdjustedPrices: () => fetchAdjustedPricesMock(),
}));

import { refreshIndustryIndices } from './ingest';

// Records each insert().values(rows) batch so tests can assert chunking +
// the single batch-stamped updatedAt. onConflictDoUpdate resolves to nothing.
function fakeDb() {
  const valuesBatches: Array<Array<Record<string, unknown>>> = [];
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn((rows: Array<Record<string, unknown>>) => {
    valuesBatches.push(rows);
    return { onConflictDoUpdate };
  });
  const insert = vi.fn(() => ({ values }));
  return { db: { insert }, insert, valuesBatches };
}

function costRow(systemId: number): RawCostIndex {
  return { solarSystemId: systemId, activity: 'manufacturing', costIndex: 0.05 };
}

function priceRow(typeId: number, adjustedPrice: number | null): RawAdjustedPrice {
  return { typeId, adjustedPrice };
}

beforeEach(() => {
  fetchCostIndicesMock.mockReset();
  fetchAdjustedPricesMock.mockReset();
});

describe('refreshIndustryIndices', () => {
  it('upserts both datasets and reports per-dataset written counts', async () => {
    fetchCostIndicesMock.mockResolvedValue([costRow(1), costRow(2)]);
    fetchAdjustedPricesMock.mockResolvedValue([priceRow(34, 2.9), priceRow(35, null)]);

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices).toMatchObject({ ok: true, written: 2 });
    expect(summary.adjustedPrices).toMatchObject({ ok: true, written: 2 });
    expect(db.insert).toHaveBeenCalledTimes(2); // one upsert per dataset
  });

  it('stamps every row in the run with a single updatedAt', async () => {
    fetchCostIndicesMock.mockResolvedValue([costRow(1)]);
    fetchAdjustedPricesMock.mockResolvedValue([priceRow(34, 2.9)]);

    const db = fakeDb();
    await refreshIndustryIndices(db.db as never);

    const stamps = new Set(
      db.valuesBatches.flat().map((r) => (r.updatedAt as Date).getTime()),
    );
    expect(stamps.size).toBe(1);
  });

  it('chunks a large upsert under the bind-param ceiling', async () => {
    const rows = Array.from({ length: UPSERT_CHUNK_SIZE + 500 }, (_, i) => costRow(i));
    fetchCostIndicesMock.mockResolvedValue(rows);
    fetchAdjustedPricesMock.mockResolvedValue([]); // empty → no insert for prices

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices.written).toBe(UPSERT_CHUNK_SIZE + 500);
    expect(db.insert).toHaveBeenCalledTimes(2); // ceil(1500 / 1000)
  });

  it('isolates a dataset failure so the sibling still persists', async () => {
    fetchCostIndicesMock.mockRejectedValue(new EsiServerError(503));
    fetchAdjustedPricesMock.mockResolvedValue([priceRow(34, 2.9)]);

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices).toEqual({ ok: false, written: 0, error: 'EsiServerError' });
    expect(summary.adjustedPrices).toMatchObject({ ok: true, written: 1 });
    expect(db.insert).toHaveBeenCalledTimes(1); // only the prices upsert ran
  });
});
