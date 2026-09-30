import { describe, expect, it } from 'vitest';
import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { deriveQueueCells, retainedSummary } from './queue-view';

const NOW = new Date('2026-09-26T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const stats: EsiRefreshQueueStat[] = [
  { status: 'queued', count: 3, oldestCreatedAt: minutesAgo(20) },
  { status: 'running', count: 1, oldestCreatedAt: minutesAgo(5) },
  { status: 'deferred_for_budget', count: 2, oldestCreatedAt: minutesAgo(180) },
  { status: 'dead_lettered', count: 1200, oldestCreatedAt: minutesAgo(60 * 24 * 3) },
  { status: 'succeeded', count: 412, oldestCreatedAt: minutesAgo(60) },
  { status: 'failed_permanent', count: 2, oldestCreatedAt: minutesAgo(60) },
];

describe('deriveQueueCells', () => {
  it('groups live statuses and reports the oldest job in each', () => {
    expect(deriveQueueCells(stats, NOW)).toEqual([
      { id: 'waiting', title: 'Queued & running', value: '4', note: 'oldest job 20m' },
      { id: 'deferred', title: 'Held for budget', value: '2', note: 'oldest job 3h' },
      { id: 'retrying', title: 'Awaiting retry', value: '0', note: 'none' },
      { id: 'dead', title: 'Dead-lettered', value: '1,200', note: 'oldest job 3d' },
    ]);
  });

  it('shows zeros for an empty queue', () => {
    expect(deriveQueueCells([], NOW).map((cell) => cell.value)).toEqual(['0', '0', '0', '0']);
  });
});

describe('retainedSummary', () => {
  it('summarises the retained terminal jobs', () => {
    expect(retainedSummary(stats)).toBe('412 succeeded · 2 failed permanently in the last 7 days');
  });
});
