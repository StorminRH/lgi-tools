import { describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from './esi-projection';
import { entryProgress, formatRemaining, romanLevel, summarizeQueue } from './progress';

const NOW = Date.parse('2026-06-11T12:00:00Z');

function entry(overrides: Partial<SkillQueueEntry>): SkillQueueEntry {
  return { skill_id: 3339, queue_position: 0, finished_level: 5, ...overrides };
}

const active = entry({
  start_date: '2026-06-11T00:00:00Z', // 12h ago
  finish_date: '2026-06-12T00:00:00Z', // 12h ahead
  level_start_sp: 0,
  level_end_sp: 1000,
  training_start_sp: 0,
});

describe('entryProgress', () => {
  it('marks a finished entry done even though ESI still lists it queued', () => {
    // The login-staleness gotcha: completion is timestamp math, never the
    // endpoint having ticked over.
    const finished = entry({
      start_date: '2026-06-01T00:00:00Z',
      finish_date: '2026-06-10T00:00:00Z',
    });
    expect(entryProgress(finished, NOW)).toEqual({ status: 'done', pct: 100 });
  });

  it('interpolates a mid-training entry by time', () => {
    const progress = entryProgress(active, NOW);
    expect(progress.status).toBe('training');
    expect(progress.pct).toBeCloseTo(50);
  });

  it('weights progress by SP when training resumed mid-level', () => {
    // Half the level was already banked; the remaining half trains over this
    // window, so at the halfway timestamp the level is 75% complete.
    const resumed = entry({
      ...active,
      level_start_sp: 0,
      level_end_sp: 1000,
      training_start_sp: 500,
    });
    expect(entryProgress(resumed, NOW).pct).toBeCloseTo(75);
  });

  it('treats a dateless entry as paused, surfacing banked SP', () => {
    const paused = entry({ level_start_sp: 0, level_end_sp: 1000, training_start_sp: 250 });
    expect(entryProgress(paused, NOW)).toEqual({ status: 'paused', pct: 25 });
  });

  it('treats a future entry as pending', () => {
    const future = entry({
      start_date: '2026-06-12T00:00:00Z',
      finish_date: '2026-06-14T00:00:00Z',
    });
    expect(entryProgress(future, NOW).status).toBe('pending');
  });
});

describe('summarizeQueue', () => {
  it('distinguishes empty from never-synced upstream states', () => {
    expect(summarizeQueue([], NOW)).toEqual({ kind: 'empty', doneCount: 0, finishesAt: null });
  });

  it('summarizes an all-paused queue as paused', () => {
    expect(summarizeQueue([entry({}), entry({ queue_position: 1 })], NOW).kind).toBe('paused');
  });

  it('summarizes an all-done queue as complete', () => {
    const done = entry({
      start_date: '2026-06-01T00:00:00Z',
      finish_date: '2026-06-10T00:00:00Z',
    });
    expect(summarizeQueue([done], NOW)).toEqual({
      kind: 'complete',
      doneCount: 1,
      finishesAt: null,
    });
  });

  it('reports the final finish time of an active queue', () => {
    const later = entry({
      queue_position: 1,
      start_date: '2026-06-12T00:00:00Z',
      finish_date: '2026-06-14T00:00:00Z',
    });
    const summary = summarizeQueue([active, later], NOW);
    expect(summary.kind).toBe('active');
    expect(summary.finishesAt).toBe(Date.parse('2026-06-14T00:00:00Z'));
  });
});

describe('formatRemaining', () => {
  it('formats the largest two units', () => {
    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});

describe('romanLevel', () => {
  it('renders in-game roman numerals', () => {
    expect(romanLevel(5)).toBe('V');
    expect(romanLevel(1)).toBe('I');
  });
});
