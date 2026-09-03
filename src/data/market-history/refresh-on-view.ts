import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db';
import { dedupe } from '@/lib/array';
import { isBoundaryStale } from '@/lib/esi-datasets/freshness';
import { computeHistoryInputs } from './aggregate';
import { historyTag } from './constants';
import { persistHistory } from './ingest';
import { getHistoryMeta, getStoredHistory } from './queries';
import { fetchHistoryFromSource } from './source';
import type { MarketHistoryInputs } from './types';

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

export interface HistoryWriteBehindResult {
  outcome: 'succeeded' | 'partial' | 'failed';
  attempted: number;
  written: number;
  durationMs: number;
}

function notifyWriteBehind(
  observer: ((result: HistoryWriteBehindResult) => void) | undefined,
  result: HistoryWriteBehindResult,
): void {
  try {
    observer?.(result);
  } catch (err) {
    console.error('[market-history/refresh-on-view] write-behind observer failed', err);
  }
}

export interface LiveHistoryResult {

  inputs: Map<number, MarketHistoryInputs>;
  degraded: HistoryDegradation;
  metrics: LiveHistoryMetrics;
}

export async function getLiveHistory(
  typeIds: number[],
  onWriteBehind?: (result: HistoryWriteBehindResult) => void,
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

  const meta = await getHistoryMeta(ids);
  const now = new Date();
  const staleIds = ids.filter((id) =>
    isBoundaryStale(meta.get(id)?.staleAfter, now),
  );

  const { results, budgetExhausted } =
    staleIds.length > 0
      ? await fetchHistoryFromSource(staleIds)
      : { results: [], budgetExhausted: false };
  degraded.budgetExhausted = budgetExhausted;
  degraded.fetched = results.length;

  const freshByType = new Map(results.map((r) => [r.typeId, r.rows]));
  const staleSet = new Set(staleIds);
  const stored = await getStoredHistory(ids);
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
    after(async () => {
      const startedAt = Date.now();
      let succeeded = 0;
      let written = 0;
      for (const r of results) {
        try {
          const summary = await persistHistory(db, r.typeId, r.rows, r.staleAfter, r.source);
          succeeded++;
          written += summary.written;
          revalidateTag(historyTag(r.typeId), 'max');
        } catch (err) {
          console.error('[market-history/refresh-on-view] write-behind failed', err);
        }
      }
      notifyWriteBehind(onWriteBehind, {
        outcome: succeeded === results.length ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial',
        attempted: results.length,
        written,
        durationMs: Date.now() - startedAt,
      });
    });
  }

  return { inputs, degraded, metrics };
}
