import type { Tone } from '@/components/ui/tones';

// Sync-error codes a tracker records on a failed refresh — shared vocabulary across
// the skills and industry-jobs panels (and any future live-character surface).
// Anything unrecognized (e.g. a raw `esi_403`) falls back to the generic entry.
const SYNC_ERROR_META: Record<string, { label: string; tone: Tone }> = {
  reauth_required: { label: 'Reconnect needed', tone: 'red' },
  budget_exhausted: { label: 'ESI budget exhausted', tone: 'orange' },
  token_unavailable: { label: 'Token unavailable', tone: 'orange' },
  contract_error: { label: 'Unexpected ESI response', tone: 'red' },
};

export function syncErrorMeta(code: string): { label: string; tone: Tone } {
  return SYNC_ERROR_META[code] ?? { label: `Sync failed (${code})`, tone: 'orange' };
}

/**
 * The empty-card copy when a character has no live data yet: a reconnect-needed
 * character will never sync until it is re-authed; otherwise we are either
 * mid-sync or waiting on the first one.
 */
export function emptyDataText(needsReconnect: boolean, syncing: boolean): string {
  if (needsReconnect) return 'Nothing synced for this character.';
  return syncing ? 'Syncing…' : 'Awaiting first sync.';
}
