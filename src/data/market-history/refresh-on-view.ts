import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db';
import { dedupe } from '@/lib/array';
import { computeHistoryInputs } from './aggregate';
import { historyTag } from './constants';
import { persistHistory } from './ingest';
import { getHistoryMeta, getStoredHistory } from './queries';
import { fetchHistoryFromSource } from './source';
import type { MarketHistoryInputs } from './types';

// Refresh-on-view engine for daily market history (3.5.3a). Mirrors the
// market-prices on-view machinery but INVERTS its fetch policy: history changes
// once daily, so this is stale-gated — it reads the stored per-type freshness
// first and only calls ESI for types past their stale_after (the ESI Expires
// boundary). A second view within the TTL makes no source call.
//
// Threads degradation facts out in its return value and never imports telemetry
// (data ⊥ telemetry stays sealed); the route handler emits.

/** Market-history degradation details explaining fallback source and staleness to callers. */
export interface HistoryDegradation {
  // Types whose live fetch succeeded this call (0 when all were warm).
  fetched: number;
  // ESI error budget was hit, forcing some stale types to keep their stored
  // series — the one degradation fact the inputs can't convey on their own.
  budgetExhausted: boolean;
}

/** Privacy-safe market-history refresh measurements including calls, rows, and elapsed milliseconds. */
export interface LiveHistoryMetrics {
  requested: number;
  freshEsi: number;
  warmStored: number;
  staleStored: number;
  missing: number;
}

/** Closed history write-behind outcome distinguishing persisted, deferred, and failed storage. */
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

/**
 * Complete refresh-on-view market-history result combining data, source, degradation, metrics, and
 * write-behind state.
 */
export interface LiveHistoryResult {
  // Freshest inputs per type: freshly fetched where stale, the stored series
  // otherwise. Types with neither are absent (caller treats as "no history").
  inputs: Map<number, MarketHistoryInputs>;
  degraded: HistoryDegradation;
  metrics: LiveHistoryMetrics;
}

/**
 * On-view read. Serves warm types from the stored rows untouched, fetches only
 * stale/missing types from ESI, returns the freshest inputs, and persists the
 * freshly fetched series as the new seed behind the response (never blocking it).
 */
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
  const now = Date.now();
  const staleIds = ids.filter((id) => {
    const m = meta.get(id);
    return m === undefined || m.staleAfter.getTime() <= now;
  });

  const { results, budgetExhausted } =
    staleIds.length > 0
      ? await fetchHistoryFromSource(staleIds)
      : { results: [], budgetExhausted: false };
  degraded.budgetExhausted = budgetExhausted;
  degraded.fetched = results.length;

  // Freshly fetched rows win; stored rows seed warm types and back-fill any
  // stale type whose fetch failed.
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

  // Write-behind: persist the freshly fetched series after the response is sent
  // (`after` extends the invocation so the upsert lands before the function
  // freezes) and bust the cached seed tag so the next page load reads it fresh.
  // A failure here must never surface.
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
