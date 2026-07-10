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

// Reactions answer to TWO activity ids: the live ESI industry-jobs endpoints
// return 9 on real reaction jobs (esi-issues #997 carries a real corp payload
// with activity_id 9; #894's table lists both "9 Reactions" and "11 Reactions")
// while the SDE's industryActivities — and this repo's ACTIVITY_NAME_TO_ID —
// say 11. Accept both so a live reaction job is never dropped or mislabeled.
function isReaction(activityId: number): boolean {
  return activityId === 9 || activityId === 11;
}

// Compact activity pill for the dense Active-jobs table (handoff §5): the three
// in-game families — manufacturing (blue), the research/copy/invention group
// (science, purple), and reactions (green). Unknown ids fall back to neutral.
export function jobActivityPill(activityId: number): { label: string; tone: Tone } {
  if (activityId === 1) return { label: 'MFG', tone: 'blue' };
  if (isReaction(activityId)) return { label: 'RX', tone: 'green' };
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
  if (isReaction(activityId)) return 'reactions';
  if (activityId === 3 || activityId === 4 || activityId === 5 || activityId === 8) {
    return 'science';
  }
  return null;
}

// `syncErrorMeta` now lives in src/components/live-character-sync (shared with
// the skill-queue tracker — the cross-feature home this comment used to defer).
