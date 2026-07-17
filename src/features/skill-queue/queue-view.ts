// Pure view derivations for the skill-queue panel. The card and its rows were making
// their SP-subtitle / queue-header / per-entry decisions inline; those move here so they
// are unit-tested and the JSX shells stay trivial (composing the already-tested
// summarizeQueue / entryProgress math from progress.ts).
import type { Tone } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format/number';
import type { SkillQueueEntry } from './esi-projection';
import { type EntryStatus, entryProgress, type QueueSummary, summarizeQueue } from './progress';
import { STATUS_META } from './skill-queue-styles';
import type { CharacterSkillData } from './types';

/**
 * The card header slot: the "queue ends in …" countdown while actively training, a
 * paused marker, or nothing (empty / complete queues).
 */
export type QueueHeader = { kind: 'ends-in'; ms: number } | { kind: 'paused' } | null;

/**
 * Display-ready queue card model consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export interface QueueCardModel {
  isEmpty: boolean;
  subtitle: string | null;
  header: QueueHeader;
}

// "X SP" plus a "· Y unallocated" clause only when there are unallocated SP.
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

/**
 * One character's queue-card model: whether the queue is empty, its SP subtitle, and the
 * header slot. A never-synced character (data:null) is inert (that is the
 * LiveCharacterCard's no-data state, distinct from a synced-but-empty queue).
 */
export function queueCardModel(data: CharacterSkillData | null, now: number): QueueCardModel {
  if (data === null) return { isEmpty: false, subtitle: null, header: null };
  const summary = summarizeQueue(data.entries, now);
  return {
    isEmpty: data.entries.length === 0,
    subtitle: queueSubtitle(data),
    header: queueHeader(summary, now),
  };
}

/**
 * Display-ready entry row model consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export interface EntryRowModel {
  status: EntryStatus;
  pct: number;
  meta: { label: string; tone: Tone };
  // Time-remaining ms, only while training (a paused / done / pending entry shows none).
  remainingMs: number | null;
  showBar: boolean;
}

/** Derives one skill queue row's progress, time remaining, level label, and completion state. */
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
