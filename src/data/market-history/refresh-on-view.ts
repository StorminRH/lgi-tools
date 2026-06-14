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

export interface HistoryDegradation {
  // Types whose live fetch succeeded this call (0 when all were warm).
  fetched: number;
  // ESI error budget was hit, forcing some stale types to keep their stored
  // series — the one degradation fact the inputs can't convey on their own.
  budgetExhausted: boolean;
}

export interface LiveHistoryResult {
  // Freshest inputs per type: freshly fetched where stale, the stored series
  // otherwise. Types with neither are absent (caller treats as "no history").
  inputs: Map<number, MarketHistoryInputs>;
  degraded: HistoryDegradation;
}

// On-view read. Serves warm types from the stored rows untouched, fetches only
// stale/missing types from ESI, returns the freshest inputs, and persists the
// freshly fetched series as the new seed behind the response (never blocking it).
export async function getLiveHistory(typeIds: number[]): Promise<LiveHistoryResult> {
  const ids = dedupe(typeIds);
  const degraded: HistoryDegradation = { fetched: 0, budgetExhausted: false };
  if (ids.length === 0) return { inputs: new Map(), degraded };

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
  const stored = await getStoredHistory(ids);
  const inputs = new Map<number, MarketHistoryInputs>();
  for (const id of ids) {
    const rows = freshByType.get(id) ?? stored.get(id) ?? [];
    if (rows.length > 0) inputs.set(id, computeHistoryInputs(id, rows));
  }

  // Write-behind: persist the freshly fetched series after the response is sent
  // (`after` extends the invocation so the upsert lands before the function
  // freezes) and bust the cached seed tag so the next page load reads it fresh.
  // A failure here must never surface.
  if (results.length > 0) {
    after(async () => {
      for (const r of results) {
        try {
          await persistHistory(db, r.typeId, r.rows, r.staleAfter, r.source);
          revalidateTag(historyTag(r.typeId), 'max');
        } catch (err) {
          console.error('[market-history/refresh-on-view] write-behind failed', err);
        }
      }
    });
  }

  return { inputs, degraded };
}
