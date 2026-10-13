import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiServerError } from '@/platform/esi';
import { UPSERT_CHUNK_SIZE } from './constants';
import type { RawAdjustedPrice, RawCostIndex } from './types';

const fetchCostIndicesMock = vi.fn();
const fetchAdjustedPricesMock = vi.fn();
const commitMock = vi.fn();
const { defaultDb } = vi.hoisted(() => ({ defaultDb: { handle: 'request-db' } as Record<string, unknown> }));

vi.mock('./source', () => ({
  fetchCostIndices: () => fetchCostIndicesMock(),
  fetchAdjustedPrices: () => fetchAdjustedPricesMock(),
}));
vi.mock('@/data/esi-store', () => ({ commit: (...args: unknown[]) => commitMock(...args) }));
vi.mock('@/db', () => ({ db: defaultDb }));

import { refreshCostIndicesOnView, refreshIndustryIndices } from './ingest';

/** Every row is a changed row unless `unchangedFrom` says the batch's later rows are not. */
function fakeDb(unchangedFrom = Number.POSITIVE_INFINITY) {
  const valuesBatches: Array<Array<Record<string, unknown>>> = [];
  const conflicts: unknown[] = [];
  const values = vi.fn((rows: Array<Record<string, unknown>>) => {
    valuesBatches.push(rows);
    return {
      onConflictDoUpdate: vi.fn((conflict: unknown) => {
        conflicts.push(conflict);
        return { returning: vi.fn().mockResolvedValue(rows.slice(0, unchangedFrom)) };
      }),
    };
  });
  const insert = vi.fn(() => ({ values }));
  return { db: { insert }, insert, valuesBatches, conflicts };
}

const META = { key: { route: '/industry/systems/', holder: { kind: 'global' } }, expiresAt: 1, etags: ['"i"'], lastModified: null, checkedAt: 0 };

function fresh<T>(rows: T[]) {
  return { kind: 'fresh', rows, meta: META };
}

function costRow(systemId: number): RawCostIndex {
  return { solarSystemId: systemId, activity: 'manufacturing', costIndex: 0.05 };
}

function priceRow(typeId: number, adjustedPrice: number | null, averagePrice: number | null = null): RawAdjustedPrice {
  return { typeId, adjustedPrice, averagePrice };
}

beforeEach(() => {
  fetchCostIndicesMock.mockReset();
  fetchAdjustedPricesMock.mockReset();
  commitMock.mockReset().mockResolvedValue(undefined);
});

describe('refreshIndustryIndices', () => {
  it('upserts both datasets, reports the changed rows and commits each answer after its write', async () => {
    fetchCostIndicesMock.mockResolvedValue(fresh([costRow(1), costRow(2)]));
    fetchAdjustedPricesMock.mockResolvedValue(fresh([priceRow(34, 2.9), priceRow(35, null)]));

    const db = fakeDb(1);
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices).toMatchObject({ ok: true, written: 1 });
    expect(summary.adjustedPrices).toMatchObject({ ok: true, written: 1 });
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.conflicts.every((conflict) => (conflict as { setWhere?: unknown }).setWhere !== undefined)).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(2);
    expect(commitMock).toHaveBeenCalledWith([META], { tag: 'eve:industry_indices' });
  });

  it('writes nothing and commits nothing for a dataset whose answer was unchanged', async () => {
    fetchCostIndicesMock.mockResolvedValue({ kind: 'unchanged' });
    fetchAdjustedPricesMock.mockResolvedValue(fresh([priceRow(34, 2.9)]));

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices).toEqual({ ok: true, written: 0 });
    expect(summary.adjustedPrices).toMatchObject({ ok: true, written: 1 });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('writes the CCP average alongside the adjusted price', async () => {
    fetchCostIndicesMock.mockResolvedValue(fresh([]));
    fetchAdjustedPricesMock.mockResolvedValue(fresh([priceRow(44992, 0, 4_690_000), priceRow(35, null)]));

    const db = fakeDb();
    await refreshIndustryIndices(db.db as never);

    expect(db.valuesBatches.flat().map(({ typeId, adjustedPrice, averagePrice }) => ({ typeId, adjustedPrice, averagePrice }))).toEqual([
      { typeId: 44992, adjustedPrice: 0, averagePrice: 4_690_000 },
      { typeId: 35, adjustedPrice: null, averagePrice: null },
    ]);
  });

  it('stamps every row in the run with a single updatedAt', async () => {
    fetchCostIndicesMock.mockResolvedValue(fresh([costRow(1)]));
    fetchAdjustedPricesMock.mockResolvedValue(fresh([priceRow(34, 2.9)]));

    const db = fakeDb();
    await refreshIndustryIndices(db.db as never);

    const stamps = new Set(
      db.valuesBatches.flat().map((r) => (r.updatedAt as Date).getTime()),
    );
    expect(stamps.size).toBe(1);
  });

  it('chunks a large upsert under the bind-param ceiling', async () => {
    const rows = Array.from({ length: UPSERT_CHUNK_SIZE + 500 }, (_, i) => costRow(i));
    fetchCostIndicesMock.mockResolvedValue(fresh(rows));
    fetchAdjustedPricesMock.mockResolvedValue(fresh([]));

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices.written).toBe(UPSERT_CHUNK_SIZE + 500);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('isolates a dataset failure so the sibling still persists, and commits nothing for it', async () => {
    fetchCostIndicesMock.mockRejectedValue(new EsiServerError(503));
    fetchAdjustedPricesMock.mockResolvedValue(fresh([priceRow(34, 2.9)]));

    const db = fakeDb();
    const summary = await refreshIndustryIndices(db.db as never);

    expect(summary.costIndices).toEqual({ ok: false, written: 0, error: 'EsiServerError' });
    expect(summary.adjustedPrices).toMatchObject({ ok: true, written: 1 });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('records no expiry when the write itself fails', async () => {
    fetchCostIndicesMock.mockResolvedValue(fresh([costRow(1)]));
    fetchAdjustedPricesMock.mockResolvedValue({ kind: 'unchanged' });
    const db = { insert: () => { throw new Error('neon: connection terminated'); } };

    const summary = await refreshIndustryIndices(db as never);

    expect(summary.costIndices).toEqual({ ok: false, written: 0, error: 'Error' });
    expect(commitMock).not.toHaveBeenCalled();
  });
});

describe('refreshCostIndicesOnView', () => {
  it('refreshes the cost indices alone, on the request database', async () => {
    fetchCostIndicesMock.mockResolvedValue(fresh([costRow(1)]));
    const insert = vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ solarSystemId: 1 }]) }) }),
    }));
    Object.assign(defaultDb, { insert });

    await expect(refreshCostIndicesOnView()).resolves.toEqual({ ok: true, written: 1 });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(fetchAdjustedPricesMock).not.toHaveBeenCalled();
    expect(commitMock).toHaveBeenCalledWith([META], { tag: 'eve:industry_indices' });
  });
});
