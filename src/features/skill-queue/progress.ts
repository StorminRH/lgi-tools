// Client-side training math for the skill queue (3.4.7). ESI does NOT advance
// skills/skillqueue until the character next logs in — a fetch at finish time
// still lists the skill as queued — so progress and completion are computed
// HERE from the queue's own start/finish timestamps, never trusted from the
// endpoint having ticked over. A sync refreshes the queue's *shape*; this
// module turns timestamps into what is true "as of" now.
import type { SkillQueueEntry } from './esi-projection';

export type EntryStatus = 'done' | 'training' | 'pending' | 'paused';

export interface EntryProgress {
  status: EntryStatus;
  // Completion of the level being trained, 0–100. Done ⇒ 100. For a paused
  // entry the timestamps are absent, so this is the SP-based fraction when
  // the SP fields exist and 0 otherwise.
  pct: number;
}

// SP-based completion of the level: how far training_start_sp has progressed
// toward level_end_sp, measured from level_start_sp. Falls back to null when
// any field is missing.
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
    // A paused queue carries no dates; show the banked SP fraction if known.
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
  // Entries whose finish_date is already behind us — trained, even though ESI
  // keeps listing them until the next login.
  doneCount: number;
  // The queue's final finish timestamp (ms), null when paused/empty/complete.
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

// Compact remaining-time for "finishes in …" labels: largest two units of
// d/h/m, sub-minute floors to "<1m".
export function formatRemaining(ms: number): string {
  if (ms < 60_000) return '<1m';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

// Roman skill levels — the in-game convention (Level V, not Level 5).
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
export function romanLevel(level: number): string {
  return ROMAN[level] ?? String(level);
}
