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

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

export function entryProgress(entry: SkillQueueEntry, now: number): EntryProgress {
  const start = entry.start_date !== undefined ? Date.parse(entry.start_date) : null;
  const finish = entry.finish_date !== undefined ? Date.parse(entry.finish_date) : null;
  if (start === null || finish === null || !Number.isFinite(start) || !Number.isFinite(finish)) {

    return { status: 'paused', pct: spPct(entry, 0) ?? 0 };
  }
  if (finish <= now) return { status: 'done', pct: 100 };
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
  const finishes = entries
    .map((entry) => (entry.finish_date !== undefined ? Date.parse(entry.finish_date) : NaN))
    .filter((t) => Number.isFinite(t));
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
    if (status === 'paused') {
      return { kind: 'paused', skillId: entry.skill_id, level: entry.finished_level, pct };
    }

    const finishesAt = entry.finish_date !== undefined ? Date.parse(entry.finish_date) : NaN;
    return { kind: 'training', skillId: entry.skill_id, level: entry.finished_level, pct, finishesAt };
  }

  return { kind: 'complete' };
}
