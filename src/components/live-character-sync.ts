import type { Tone } from '@/components/ui/tones';

const SYNC_ERROR_META: Record<string, { label: string; tone: Tone }> = {
  reauth_required: { label: 'Reconnect needed', tone: 'red' },
  budget_exhausted: { label: 'ESI budget exhausted', tone: 'orange' },
  token_unavailable: { label: 'Token unavailable', tone: 'orange' },
  contract_error: { label: 'Unexpected ESI response', tone: 'red' },
};

export function syncErrorMeta(code: string): { label: string; tone: Tone } {
  return SYNC_ERROR_META[code] ?? { label: `Sync failed (${code})`, tone: 'orange' };
}

export function emptyDataText(needsReconnect: boolean, syncing: boolean): string {
  if (needsReconnect) return 'Nothing synced for this character.';
  return syncing ? 'Syncing…' : 'Awaiting first sync.';
}
