// Domain → tone mapping for the skill-queue feature. The only place that
// knows "training is green" — UI primitives stay tone-abstract.
import type { Tone } from '@/components/ui/tones';
import type { EntryStatus } from './progress';

export const STATUS_META: Record<EntryStatus, { label: string; tone: Tone }> = {
  training: { label: 'Training', tone: 'green' },
  done: { label: 'Done', tone: 'teal' },
  pending: { label: 'Queued', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'orange' },
};

// Sync-error codes the action records on a characterSync doc. Anything
// unrecognized (e.g. a raw `esi_403`) falls back to the generic entry.
const SYNC_ERROR_META: Record<string, { label: string; tone: Tone }> = {
  reauth_required: { label: 'Reconnect needed', tone: 'red' },
  budget_exhausted: { label: 'ESI budget exhausted', tone: 'orange' },
  token_unavailable: { label: 'Token unavailable', tone: 'orange' },
  contract_error: { label: 'Unexpected ESI response', tone: 'red' },
};

export function syncErrorMeta(code: string): { label: string; tone: Tone } {
  return SYNC_ERROR_META[code] ?? { label: `Sync failed (${code})`, tone: 'orange' };
}
