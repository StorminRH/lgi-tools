import { clampPct } from '@/lib/math';
import type { SkillQueueEntry } from './esi-projection';

export type EntryStatus = 'done' | 'training' | 'pending' | 'paused';

export interface EntryProgress {
  status: EntryStatus;
  pct: number;
}

function spPct(entry: SkillQueueEntry, trainedFraction: number): number | null {
  const { level_start_sp: startSp, level_end_sp: endSp, training_start_sp: trainingStartSp } = entry;
  if (startSp === undefined || endSp === undefined || trainingStartSp === undefined) return null;
  if (endSp <= startSp) return null;
  const currentSp = trainingStartSp + (endSp - trainingStartSp) * trainedFraction;
  return clampPct(((currentSp - startSp) / (endSp - startSp)) * 100);
}

function parseOptionalMs(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export interface EntryTimes {
  /** Epoch ms, or null when the date is missing or does not parse. */
  start: number | null;
  finish: number | null;
}

/** A queue entry's start and finish times; ESI omits both while the queue is paused. */
export function entryTimes(entry: Pick<SkillQueueEntry, 'start_date' | 'finish_date'>): EntryTimes {
  return { start: parseOptionalMs(entry.start_date), finish: parseOptionalMs(entry.finish_date) };
}

/**
 * An entry has finished once its finish time has passed, whatever its start
 * time says. A missing or unparseable finish never counts as finished.
 */
export function isEntryFinished(entry: Pick<SkillQueueEntry, 'finish_date'>, now: number): boolean {
  const finish = parseOptionalMs(entry.finish_date);
  return finish !== null && finish <= now;
}

export function entryProgress(entry: SkillQueueEntry, now: number): EntryProgress {
  if (isEntryFinished(entry, now)) return { status: 'done', pct: 100 };
  const { start, finish } = entryTimes(entry);
  if (start === null || finish === null) return { status: 'paused', pct: spPct(entry, 0) ?? 0 };
  if (start > now) return { status: 'pending', pct: spPct(entry, 0) ?? 0 };
  const timeFraction = (now - start) / (finish - start);
  return {
    status: 'training',
    pct: spPct(entry, timeFraction) ?? clampPct(timeFraction * 100),
  };
}

export interface QueueSummary {
  kind: 'empty' | 'paused' | 'active' | 'complete';
  doneCount: number;
  finishesAt: number | null;
}

export function summarizeQueue(entries: SkillQueueEntry[], now: number): QueueSummary {
  if (entries.length === 0) return { kind: 'empty', doneCount: 0, finishesAt: null };
  const statuses = entries.map((entry) => entryProgress(entry, now).status);
  const doneCount = statuses.filter((status) => status === 'done').length;
  if (statuses.every((status) => status === 'paused')) {
    return { kind: 'paused', doneCount: 0, finishesAt: null };
  }
  if (doneCount === entries.length) {
    return { kind: 'complete', doneCount, finishesAt: null };
  }
  const finishes = entries.map((entry) => entryTimes(entry).finish).filter((finish) => finish !== null);
  return {
    kind: 'active',
    doneCount,
    finishesAt: finishes.length > 0 ? Math.max(...finishes) : null,
  };
}

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
export function romanLevel(level: number): string {
  return ROMAN[level] ?? String(level);
}

export type CurrentTraining =
  | { kind: 'empty' }
  | { kind: 'complete' }
  | { kind: 'paused'; skillId: number; level: number; pct: number }
  | { kind: 'training'; skillId: number; level: number; pct: number; finishesAt: number };

export function currentTraining(entries: SkillQueueEntry[], now: number): CurrentTraining {
  if (entries.length === 0) return { kind: 'empty' };
  const ordered = [...entries].sort((a, b) => a.queue_position - b.queue_position);
  for (const entry of ordered) {
    const { status, pct } = entryProgress(entry, now);
    if (status === 'done') continue;
    // Any status but paused means both dates parsed, so the finish is set.
    const { finish } = entryTimes(entry);
    if (status === 'paused' || finish === null) {
      return { kind: 'paused', skillId: entry.skill_id, level: entry.finished_level, pct };
    }
    return { kind: 'training', skillId: entry.skill_id, level: entry.finished_level, pct, finishesAt: finish };
  }
  return { kind: 'complete' };
}
