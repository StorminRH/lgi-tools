import type { Tone } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format/number';
import type { SkillQueueEntry } from './esi-projection';
import { type EntryStatus, entryProgress, type QueueSummary, summarizeQueue } from './progress';
import { STATUS_META } from './skill-queue-styles';
import type { CharacterSkillData } from './types';

export type QueueHeader = { kind: 'ends-in'; ms: number } | { kind: 'paused' } | null;

export interface QueueCardModel {
  isEmpty: boolean;
  subtitle: string | null;
  header: QueueHeader;
}

function queueSubtitle(data: CharacterSkillData): string {
  const sp = `${formatQuantity(data.totalSp)} SP`;
  const unallocated =
    data.unallocatedSp !== undefined && data.unallocatedSp > 0
      ? ` · ${formatQuantity(data.unallocatedSp)} unallocated`
      : '';
  return `${sp}${unallocated}`;
}

function queueHeader(summary: QueueSummary, now: number): QueueHeader {
  if (summary.kind === 'active' && summary.finishesAt !== null) {
    return { kind: 'ends-in', ms: summary.finishesAt - now };
  }
  if (summary.kind === 'paused') return { kind: 'paused' };
  return null;
}

export function queueCardModel(data: CharacterSkillData | null, now: number): QueueCardModel {
  if (data === null) return { isEmpty: false, subtitle: null, header: null };
  const summary = summarizeQueue(data.entries, now);
  return {
    isEmpty: data.entries.length === 0,
    subtitle: queueSubtitle(data),
    header: queueHeader(summary, now),
  };
}

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
