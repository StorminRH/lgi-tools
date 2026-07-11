import { sql } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import { UPSERT_CHUNK_SIZE } from './constants';
import { adjustedPrices, industryCostIndices } from './schema';
import { fetchAdjustedPrices, fetchCostIndices } from './source';
import type { RawAdjustedPrice, RawCostIndex } from './types';
import type { AnyPgDb } from '@/lib/db-types';

// EXCLUDED is the proposed-but-conflicted row inside ON CONFLICT.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// Per-dataset outcome. The two datasets refresh independently — one failing
// (ESI 5xx, budget exhaustion, a contract mismatch) must not block the other —
// so the route emits health off each. `error` is the thrown error's class name
// (e.g. EsiServerError) when ok is false.
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

async function persistCostIndices(
  db: AnyPgDb,
  rows: RawCostIndex[],
  updatedAt: Date,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    await db
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
        set: { costIndex: excluded('cost_index'), updatedAt: excluded('updated_at') },
      });
    written += batch.length;
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
    await db
      .insert(adjustedPrices)
      .values(
        batch.map((r) => ({
          typeId: r.typeId,
          adjustedPrice: r.adjustedPrice,
          updatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: adjustedPrices.typeId,
        set: { adjustedPrice: excluded('adjusted_price'), updatedAt: excluded('updated_at') },
      });
    written += batch.length;
  }
  return written;
}

// Fetch + persist one dataset, isolating its failure so the sibling still runs.
async function refreshDataset<T>(
  fetcher: () => Promise<T[]>,
  persist: (rows: T[]) => Promise<number>,
): Promise<DatasetResult> {
  try {
    const rows = await fetcher();
    const written = await persist(rows);
    return { ok: true, written };
  } catch (err) {
    return {
      ok: false,
      written: 0,
      error: err instanceof Error ? err.constructor.name : 'unknown',
    };
  }
}

// Refresh both datasets from ESI in one pass. The two run concurrently — they
// are independent ESI calls + upserts, and `refreshDataset` swallows its own
// errors into a result (never rejects), so one failing doesn't block the other.
// A single batch-stamped `updatedAt`, captured up front, marks every row written
// this run. Each ESI fetch completes before that dataset's upsert and with no
// transaction open, so no DB connection is pinned across the network round-trip
// (the upserts are single statements, chunked to stay under Postgres's
// bind-param ceiling). Pure upsert, no delete — last-write-wins and idempotent,
// since systems/types don't vanish.
export async function refreshIndustryIndices(db: AnyPgDb): Promise<RefreshIndicesSummary> {
  const start = Date.now();
  const updatedAt = new Date();

  const [costIndices, adjustedPricesResult] = await Promise.all([
    refreshDataset(fetchCostIndices, (rows) => persistCostIndices(db, rows, updatedAt)),
    refreshDataset(fetchAdjustedPrices, (rows) => persistAdjustedPrices(db, rows, updatedAt)),
  ]);

  return {
    costIndices,
    adjustedPrices: adjustedPricesResult,
    durationMs: Date.now() - start,
  };
}
