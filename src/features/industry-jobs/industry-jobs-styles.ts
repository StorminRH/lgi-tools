import type { Tone } from '@/components/ui/tones';
import { ACTIVITY_NAME_TO_ID, LEGACY_REACTION_ACTIVITY_ID } from '@/data/eve-data/constants';
import type { JobStatus } from './esi-projection';

export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  ready: { label: 'Ready', tone: 'teal' },
  paused: { label: 'Paused', tone: 'orange' },
  delivered: { label: 'Delivered', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red-soft' },
  reverted: { label: 'Reverted', tone: 'red-soft' },
};

function isReaction(activityId: number): boolean {
  return activityId === LEGACY_REACTION_ACTIVITY_ID || activityId === ACTIVITY_NAME_TO_ID.reaction;
}

function isScience(activityId: number): boolean {
  return (
    activityId === ACTIVITY_NAME_TO_ID.research_time ||
    activityId === ACTIVITY_NAME_TO_ID.research_material ||
    activityId === ACTIVITY_NAME_TO_ID.copying ||
    activityId === ACTIVITY_NAME_TO_ID.invention
  );
}

export type JobCategory = 'manufacturing' | 'science' | 'reactions';

export function jobCategory(activityId: number): JobCategory | null {
  if (activityId === ACTIVITY_NAME_TO_ID.manufacturing) return 'manufacturing';
  if (isReaction(activityId)) return 'reactions';
  if (isScience(activityId)) return 'science';
  return null;
}

