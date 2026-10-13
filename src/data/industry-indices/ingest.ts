import { or, sql, type SQL } from 'drizzle-orm';
import { commit } from '@/data/esi-store';
import { db as defaultDb } from '@/db';
import { chunk } from '@/lib/array';
import { excluded, excludedSet } from '@/lib/db-upsert';
import { UPSERT_CHUNK_SIZE } from './constants';
import { INDUSTRY_INDICES_TAG } from './keys';
import { adjustedPrices, industryCostIndices } from './schema';
import { fetchAdjustedPrices, fetchCostIndices, type SourceRead } from './source';
import type { RawAdjustedPrice, RawCostIndex } from './types';
import type { AnyPgDb } from '@/lib/db-types';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Per-dataset outcome. The two datasets refresh independently — one failing
 * (ESI 5xx, budget exhaustion, a contract mismatch) must not block the other —
 * so the route emits health off each. `written` counts the rows that changed:
 * an unchanged row keeps its `updated_at`, and a 304 writes nothing. `error`
 * is the thrown error's class name (e.g. EsiServerError) when ok is false.
 */
export interface DatasetResult {
  ok: boolean;
  written: number;
  error?: string;
}

export interface RefreshIndicesSummary {
  costIndices: DatasetResult;
  adjustedPrices: DatasetResult;
  durationMs: number;
}

/** True when the proposed value differs from the stored one, NULLs compared as values. */
function changed(column: AnyPgColumn): SQL {
  return sql`${column} IS DISTINCT FROM ${excluded(column)}`;
}

async function persistCostIndices(
  db: AnyPgDb,
  rows: RawCostIndex[],
  updatedAt: Date,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const touched = await db
      .insert(industryCostIndices)
      .values(
        batch.map((r) => ({
          solarSystemId: r.solarSystemId,
          activity: r.activity,
          costIndex: r.costIndex,
          updatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [industryCostIndices.solarSystemId, industryCostIndices.activity],
        set: excludedSet(industryCostIndices, ['costIndex', 'updatedAt']),
        setWhere: changed(industryCostIndices.costIndex),
      })
      .returning({ solarSystemId: industryCostIndices.solarSystemId });
    written += touched.length;
  }
  return written;
}

async function persistAdjustedPrices(
  db: AnyPgDb,
  rows: RawAdjustedPrice[],
  updatedAt: Date,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const touched = await db
      .insert(adjustedPrices)
      .values(
        batch.map((r) => ({
          typeId: r.typeId,
          adjustedPrice: r.adjustedPrice,
          averagePrice: r.averagePrice,
          updatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: adjustedPrices.typeId,
        set: excludedSet(adjustedPrices, ['adjustedPrice', 'averagePrice', 'updatedAt']),
        setWhere: or(changed(adjustedPrices.adjustedPrice), changed(adjustedPrices.averagePrice)),
      })
      .returning({ typeId: adjustedPrices.typeId });
    written += touched.length;
  }
  return written;
}

/**
 * One dataset: read through the store, write the rows that changed, then
 * commit the answer's expiry and ETag so the next read within it makes no
 * call and the one after sends If-None-Match. A 304 has already recorded
 * its expiry and writes nothing.
 */
async function refreshDataset<T>(
  read: () => Promise<SourceRead<T>>,
  persist: (rows: T[]) => Promise<number>,
): Promise<DatasetResult> {
  try {
    const source = await read();
    if (source.kind === 'unchanged') return { ok: true, written: 0 };
    const written = await persist(source.rows);
    await commit([source.meta], { tag: INDUSTRY_INDICES_TAG });
    return { ok: true, written };
  } catch (err) {
    return {
      ok: false,
      written: 0,
      error: err instanceof Error ? err.constructor.name : 'unknown',
    };
  }
}

function refreshCostIndices(db: AnyPgDb, updatedAt: Date): Promise<DatasetResult> {
  return refreshDataset(fetchCostIndices, (rows) => persistCostIndices(db, rows, updatedAt));
}

/**
 * The cost indices once a view finds them due. No lock: two instances that
 * both find them due both call, and the second gets CCP's shared copy or
 * a 304; the cron backstop below runs the same code, so an overlap is a
 * 304 or the same changed rows.
 */
export function refreshCostIndicesOnView(): Promise<DatasetResult> {
  return refreshCostIndices(defaultDb, new Date());
}

/** The daily backstop: both datasets, each on its own, through the same store reads as a view. */
export async function refreshIndustryIndices(db: AnyPgDb): Promise<RefreshIndicesSummary> {
  const start = Date.now();
  const updatedAt = new Date();

  const [costIndices, adjustedPricesResult] = await Promise.all([
    refreshCostIndices(db, updatedAt),
    refreshDataset(fetchAdjustedPrices, (rows) => persistAdjustedPrices(db, rows, updatedAt)),
  ]);

  return {
    costIndices,
    adjustedPrices: adjustedPricesResult,
    durationMs: Date.now() - start,
  };
}
