import type { Tone } from '@/components/ui/tones';
import { ACTIVITY_ID_LABEL } from '@/data/eve-data/constants';
import type { JobStatus } from './esi-projection';

export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  ready: { label: 'Ready', tone: 'teal' },
  paused: { label: 'Paused', tone: 'orange' },
  delivered: { label: 'Delivered', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red-soft' },
  reverted: { label: 'Reverted', tone: 'red-soft' },
};

export function jobActivityLabel(activityId: number): string {
  return ACTIVITY_ID_LABEL[activityId] ?? 'Industry';
}

function isReaction(activityId: number): boolean {
  return activityId === 9 || activityId === 11;
}

export function jobActivityPill(activityId: number): { label: string; tone: Tone } {
  if (activityId === 1) return { label: 'MFG', tone: 'blue' };
  if (isReaction(activityId)) return { label: 'RX', tone: 'green' };
  if (activityId === 3 || activityId === 4 || activityId === 5 || activityId === 8) {
    return { label: 'SCI', tone: 'purple' };
  }
  return { label: 'IND', tone: 'neutral' };
}

export type JobCategory = 'manufacturing' | 'science' | 'reactions';

export function jobCategory(activityId: number): JobCategory | null {
  if (activityId === 1) return 'manufacturing';
  if (isReaction(activityId)) return 'reactions';
  if (activityId === 3 || activityId === 4 || activityId === 5 || activityId === 8) {
    return 'science';
  }
  return null;
}

