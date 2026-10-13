import { after } from 'next/server';
import { commit, isExpired, storedExpiries, type EsiResponseMeta } from '@/data/esi-store';
import { db } from '@/db';
import { dedupe } from '@/lib/array';
import { runWriteBehind, type WriteBehindResult } from '@/lib/write-behind';
import { computeHistoryInputs } from './aggregate';
import { persistHistory } from './ingest';
import { historyKey, MARKET_HISTORY_TAG } from './keys';
import { getStoredHistory } from './queries';
import { fetchHistoryFromSource } from './source';
import type { MarketHistoryInputs, RawHistory } from './types';

export interface HistoryDegradation {
  fetched: number;
  budgetExhausted: boolean;
}

export interface LiveHistoryMetrics {
  requested: number;
  freshEsi: number;
  warmStored: number;
  staleStored: number;
  missing: number;
}

const SCOPE = 'market-history/refresh-on-view';

export interface LiveHistoryResult {
  inputs: Map<number, MarketHistoryInputs>;
  degraded: HistoryDegradation;
  metrics: LiveHistoryMetrics;
}

export async function getLiveHistory(
  typeIds: number[],
  onWriteBehind?: (result: WriteBehindResult) => void,
): Promise<LiveHistoryResult> {
  const ids = dedupe(typeIds);
  const degraded: HistoryDegradation = { fetched: 0, budgetExhausted: false };
  const metrics: LiveHistoryMetrics = {
    requested: ids.length,
    freshEsi: 0,
    warmStored: 0,
    staleStored: 0,
    missing: 0,
  };
  if (ids.length === 0) return { inputs: new Map(), degraded, metrics };

  // Expiries first, then the stored series. A write-behind saves its rows
  // before it commits their expiry, so rows read after an expiry are at
  // least as fresh as it; read together, an old series could pass as fresh.
  const expiries = await storedExpiries(ids.map(historyKey));
  const stored = await getStoredHistory(ids);
  const now = Date.now();
  const staleIds = ids.filter((_id, i) => isExpired(expiries[i] ?? null, now));

  const { results, budgetExhausted } =
    staleIds.length > 0
      ? await fetchHistoryFromSource(staleIds)
      : { results: [], budgetExhausted: false };
  degraded.budgetExhausted = budgetExhausted;
  degraded.fetched = results.length;

  const freshByType = new Map(results.map((r) => [r.typeId, r.rows]));
  const staleSet = new Set(staleIds);
  const inputs = new Map<number, MarketHistoryInputs>();
  for (const id of ids) {
    const rows = freshByType.get(id) ?? stored.get(id) ?? [];
    if (rows.length > 0) {
      inputs.set(id, computeHistoryInputs(id, rows));
      if (freshByType.has(id)) metrics.freshEsi++;
      else if (staleSet.has(id)) metrics.staleStored++;
      else metrics.warmStored++;
    } else {
      metrics.missing++;
    }
  }

  if (results.length > 0) {
    after(() => runWriteBehind(SCOPE, results.length, () => persistEach(results), onWriteBehind));
  }

  return { inputs, degraded, metrics };
}

/**
 * Persists each fetched series on its own, so one failed type is logged and
 * skipped while the rest are still written, then commits CCP's expiry for
 * the types written; the commit clears the dataset's tag for each of them.
 */
async function persistEach(results: RawHistory[]): Promise<{ succeeded: number; written: number }> {
  const committed: EsiResponseMeta[] = [];
  let written = 0;
  for (const r of results) {
    try {
      written += await persistOne(r);
      committed.push(r.meta);
    } catch (err) {
      console.error(`[${SCOPE}] write-behind failed`, err);
    }
  }
  await commit(committed, { tag: MARKET_HISTORY_TAG });
  return { succeeded: committed.length, written };
}

/**
 * One type's rows, stamped stale at CCP's expiry (the fetch time when ESI
 * sent none, so it is due again at once). The commit that follows clears
 * the dataset's tag for every type written.
 */
async function persistOne(r: RawHistory): Promise<number> {
  const staleAfter = new Date(r.meta.expiresAt ?? r.meta.checkedAt);
  const summary = await persistHistory(db, r.typeId, r.rows, staleAfter, r.source);
  return summary.written;
}
