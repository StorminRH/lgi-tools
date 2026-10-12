import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { commit, isExpired, storedExpiries, type EsiResponseMeta } from '@/data/esi-store';
import { db } from '@/db';
import { dedupe } from '@/lib/array';
import { computeHistoryInputs } from './aggregate';
import { historyTag } from './constants';
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

  const expiries = await storedExpiries(ids.map(historyKey));
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
      const committed: EsiResponseMeta[] = [];
      let written = 0;
      for (const r of results) {
        try {
          written += await persistOne(r);
          committed.push(r.meta);
        } catch (err) {
          console.error('[market-history/refresh-on-view] write-behind failed', err);
        }
      }
      await commit(committed, { tag: MARKET_HISTORY_TAG });
      const succeeded = committed.length;
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

/** One type's rows, stamped stale at CCP's expiry (the fetch time when ESI sent none, so it is due again at once). */
async function persistOne(r: RawHistory): Promise<number> {
  const staleAfter = new Date(r.meta.expiresAt ?? r.meta.checkedAt);
  const summary = await persistHistory(db, r.typeId, r.rows, staleAfter, r.source);
  revalidateTag(historyTag(r.typeId), 'max');
  return summary.written;
}
