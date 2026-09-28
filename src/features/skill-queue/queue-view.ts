import type { Tone } from '@/components/ui/tones';
import type { SkillQueueEntry } from './esi-projection';
import { type EntryStatus, entryProgress } from './progress';
import { STATUS_META } from './skill-queue-styles';

export interface EntryRowModel {
  status: EntryStatus;
  pct: number;
  meta: { label: string; tone: Tone };
  remainingMs: number | null;
  showBar: boolean;
}

export function entryRowModel(entry: SkillQueueEntry, now: number): EntryRowModel {
  const progress = entryProgress(entry, now);
  const finish = entry.finish_date !== undefined ? Date.parse(entry.finish_date) : null;
  const training = progress.status === 'training';
  return {
    status: progress.status,
    pct: progress.pct,
    meta: STATUS_META[progress.status],
    remainingMs: training && finish !== null ? finish - now : null,
    showBar: training,
  };
}
