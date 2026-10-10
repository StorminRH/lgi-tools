import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(),
  stats: vi.fn(),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));
vi.mock('@/data/esi-refresh-jobs/queries', () => ({ listDeadLetteredJobs: mocks.jobs }));
vi.mock('../shared-reads', () => ({ getEsiRefreshQueueStatsShared: mocks.stats }));

import { DeadLetterList, loadDeadLetters, QueueSummary } from './QueueCards';

const NOW = new Date('2026-10-09T12:00:00Z');

function job(id: number, attemptCount: number): DeadLetterRow {
  return {
    id,
    dataset: 'owned_assets',
    ownerType: 'corporation',
    ownerId: 98_000_000 + id,
    resource: '/corporations/{n}/assets',
    budgetReason: null,
    lastErrorCode: 'provider_5xx',
    attemptCount,
    createdAt: NOW,
    finishedAt: NOW,
  };
}

const deadStats: EsiRefreshQueueStat[] = [{ status: 'dead_lettered', count: 120, oldestCreatedAt: NOW }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadDeadLetters', () => {
  it('pairs the newest jobs with the real total', async () => {
    mocks.jobs.mockResolvedValue([job(1, 1), job(2, 5)]);
    mocks.stats.mockResolvedValue(deadStats);

    const { rows, hint } = await loadDeadLetters();

    expect(mocks.jobs).toHaveBeenCalledWith(50);
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    expect(hint).toBe('120 jobs · newest 2 shown');
  });

  it('keeps the list when only the total fails', async () => {
    silenceConsolePrefixes('error', ['[admin] dead-letter-total section unavailable']);
    mocks.jobs.mockResolvedValue([job(1, 1)]);
    mocks.stats.mockRejectedValue(new Error('offline'));

    const { rows, hint } = await loadDeadLetters();

    expect(rows).toHaveLength(1);
    expect(hint).toBeUndefined();
  });
});

describe('DeadLetterList', () => {
  it('names each retry after its job and counts attempts', async () => {
    mocks.jobs.mockResolvedValue([job(1, 1), job(2, 5)]);
    mocks.stats.mockResolvedValue(deadStats);
    const { rows } = await loadDeadLetters();

    const html = renderToStaticMarkup(createElement(DeadLetterList, { rows }));

    expect(html).toContain('aria-label="Retry owned assets · corporation 98000001"');
    expect(html).toContain('aria-label="Retry owned assets · corporation 98000002"');
    expect(html).toContain('1 attempt ·');
    expect(html).toContain('5 attempts ·');
  });

  it('reads as all clear with nothing dead-lettered', () => {
    const html = renderToStaticMarkup(createElement(DeadLetterList, { rows: [] }));

    expect(html).toContain('No dead-lettered jobs.');
    expect(html).not.toContain('<ul');
  });
});

describe('QueueSummary', () => {
  it('drops the age note under an empty group and closes on the retained jobs', () => {
    const html = renderToStaticMarkup(
      createElement(QueueSummary, {
        stats: [{ status: 'queued', count: 3, oldestCreatedAt: new Date(NOW.getTime() - 20 * 60_000) }],
        now: NOW,
      }),
    );

    expect(html).toContain('oldest job 20m');
    expect(html).not.toContain('none');
    expect(html).toContain('0 succeeded · 0 failed permanently in the last 7 days');
  });
});
