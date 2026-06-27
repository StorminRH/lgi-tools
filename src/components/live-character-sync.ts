import type { Tone } from '@/components/ui/tones';

// One merged live row (SA.5): a tracker's COLD payload joined with its HOT
// freshness/error meta by entity id. `data` is null when the cold half has no
// payload for that id yet (unfetched / errored-first / needs-reconnect) — the
// same "no data yet" the single pre-split row carried. The hot row is the entity
// superset (every synced id has a hot row; a cold row exists only once data has
// landed); we still union defensively so a cold-only id during a one-tick
// subscription skew surfaces rather than vanishing.
export interface MergedLiveRow<D> {
  data: D | null;
  lastSyncedAt: number | null;
  syncError: string | null;
}

// Join the COLD payload rows and HOT meta rows by their normalized id, mirroring
// the pre-split forViewer per-entity shape. Pure so the union/default logic is
// unit-testable independent of Convex.
export function mergeLiveById<D>(
  cold: ReadonlyArray<{ id: number; data: D }>,
  hot: ReadonlyArray<{ id: number; lastSyncedAt: number | null; syncError: string | null }>,
): Array<{ id: number } & MergedLiveRow<D>> {
  const dataById = new Map(cold.map((c) => [c.id, c.data] as const));
  const seen = new Set<number>();
  const merged: Array<{ id: number } & MergedLiveRow<D>> = hot.map((h) => {
    seen.add(h.id);
    return {
      id: h.id,
      data: dataById.get(h.id) ?? null,
      lastSyncedAt: h.lastSyncedAt,
      syncError: h.syncError,
    };
  });
  for (const c of cold) {
    if (!seen.has(c.id)) {
      merged.push({ id: c.id, data: c.data, lastSyncedAt: null, syncError: null });
    }
  }
  return merged;
}

// Sync-error codes the presence-gated engine's action records on a *Sync doc.
// Shared vocabulary across the skills and industry-jobs trackers (and any future
// live-character surface). Anything unrecognized (e.g. a raw `esi_403`) falls
// back to the generic entry.
const SYNC_ERROR_META: Record<string, { label: string; tone: Tone }> = {
  reauth_required: { label: 'Reconnect needed', tone: 'red' },
  budget_exhausted: { label: 'ESI budget exhausted', tone: 'orange' },
  token_unavailable: { label: 'Token unavailable', tone: 'orange' },
  contract_error: { label: 'Unexpected ESI response', tone: 'red' },
};

export function syncErrorMeta(code: string): { label: string; tone: Tone } {
  return SYNC_ERROR_META[code] ?? { label: `Sync failed (${code})`, tone: 'orange' };
}

// The empty-card copy when a character has no live data yet: a reconnect-needed
// character will never sync until it is re-authed; otherwise we are either
// mid-sync or waiting on the first one.
export function emptyDataText(needsReconnect: boolean, syncing: boolean): string {
  if (needsReconnect) return 'Nothing synced for this character.';
  return syncing ? 'Syncing…' : 'Awaiting first sync.';
}
