// Domain → tone mapping for the industry-jobs feature. The only place that
// knows "an active job is green" — UI primitives stay tone-abstract.
import type { Tone } from '@/components/ui/tones';
import { ACTIVITY_ID_LABEL } from '@/data/eve-data/constants';
import type { JobStatus } from './esi-projection';

// Meta for every status the schema can store — delivered/cancelled/reverted
// shouldn't appear without `include_completed`, but a stored status must
// always render rather than crash (meta over filtering).
export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  ready: { label: 'Ready', tone: 'teal' },
  paused: { label: 'Paused', tone: 'orange' },
  delivered: { label: 'Delivered', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red-soft' },
  reverted: { label: 'Reverted', tone: 'red-soft' },
};

// Display name for a job's activity, off the shared eve-data id → label map.
export function jobActivityLabel(activityId: number): string {
  return ACTIVITY_ID_LABEL[activityId] ?? 'Industry';
}

// Sync-error codes the action records on an industryJobsSync doc. Same code
// vocabulary as the skills tracker (a shared home is the 3.4.9 engine's
// call — duplicating ten lines beats a feature → feature edge today).
// Anything unrecognized (e.g. a raw `esi_403`) falls back to the generic
// entry.
const SYNC_ERROR_META: Record<string, { label: string; tone: Tone }> = {
  reauth_required: { label: 'Reconnect needed', tone: 'red' },
  budget_exhausted: { label: 'ESI budget exhausted', tone: 'orange' },
  token_unavailable: { label: 'Token unavailable', tone: 'orange' },
  contract_error: { label: 'Unexpected ESI response', tone: 'red' },
};

export function syncErrorMeta(code: string): { label: string; tone: Tone } {
  return SYNC_ERROR_META[code] ?? { label: `Sync failed (${code})`, tone: 'orange' };
}
