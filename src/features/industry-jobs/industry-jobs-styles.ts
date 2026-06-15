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

// Compact activity pill for the dense Active-jobs table (handoff §5): the three
// in-game families — manufacturing (blue), the research/copy/invention group
// (science, purple), and reactions (green). Unknown ids fall back to neutral.
export function jobActivityPill(activityId: number): { label: string; tone: Tone } {
  if (activityId === 1) return { label: 'MFG', tone: 'blue' };
  if (activityId === 11) return { label: 'RX', tone: 'green' };
  if (activityId === 3 || activityId === 4 || activityId === 5 || activityId === 8) {
    return { label: 'SCI', tone: 'purple' };
  }
  return { label: 'IND', tone: 'neutral' };
}

export type JobCategory = 'manufacturing' | 'science' | 'reactions';

// Which slot family a job's activity occupies, for the header's used-slot
// counts. Returns null for activities that don't map to a tracked family.
export function jobCategory(activityId: number): JobCategory | null {
  if (activityId === 1) return 'manufacturing';
  if (activityId === 11) return 'reactions';
  if (activityId === 3 || activityId === 4 || activityId === 5 || activityId === 8) {
    return 'science';
  }
  return null;
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
