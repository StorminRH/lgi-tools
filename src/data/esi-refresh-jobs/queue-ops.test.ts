import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

let cannedQueries: unknown[][] = [];

function queryFor(rows: unknown[]) {
  const result = Promise.resolve(rows);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: result.then.bind(result),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.groupBy.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

vi.mock('@/db', () => ({
  db: {
    execute: h.execute,
    select: h.select.mockImplementation(() => queryFor(cannedQueries.shift() ?? [])),
  },
}));

import {
  getEsiRefreshQueueStats,
  listDeadLetteredJobs,
  requeueDeadLetteredJob,
} from './queries';

const NOW = new Date('2026-07-14T12:00:00Z');

beforeEach(() => {
  cannedQueries = [];
  h.execute.mockReset();
  h.select.mockClear();
});

describe('ESI refresh queue ops reads', () => {
  it('normalizes grouped queue stats', async () => {
    const oldest = new Date('2026-07-14T10:00:00Z');
    cannedQueries = [[{ status: 'queued', count: '3', oldestCreatedAt: oldest }]];
    await expect(getEsiRefreshQueueStats()).resolves.toEqual([
      { status: 'queued', count: 3, oldestCreatedAt: oldest },
    ]);
  });

  it('returns only the redacted dead-letter projection', async () => {
    const row = {
      id: 7,
      dataset: 'skills',
      ownerType: 'character',
      ownerId: 90_000_001,
      resource: '/characters/{n}/skills',
      budgetReason: 'rate_limited',
      lastErrorCode: 'timeout',
      attemptCount: 5,
      createdAt: NOW,
      finishedAt: NOW,
    };
    cannedQueries = [[row]];
    await expect(listDeadLetteredJobs(10)).resolves.toEqual([row]);
  });
});

describe('requeueDeadLetteredJob', () => {
  it('resets a dead letter for the normal queue drain', async () => {
    h.execute.mockResolvedValueOnce([{ outcome: 'requeued' }]);
    await expect(requeueDeadLetteredJob(7, NOW)).resolves.toEqual({ outcome: 'requeued' });
    expect(h.execute).toHaveBeenCalledOnce();
  });

  it('reads the neon-http result envelope used in production', async () => {
    h.execute.mockResolvedValueOnce({ rows: [{ outcome: 'requeued' }] });
    await expect(requeueDeadLetteredJob(7, NOW)).resolves.toEqual({ outcome: 'requeued' });
  });

  it.each([
    ['missing row', [], { outcome: 'not_found' }],
    ['non-dead-lettered row', [{ outcome: 'not_found' }], { outcome: 'not_found' }],
    ['live replacement', [{ outcome: 'superseded' }], { outcome: 'superseded' }],
  ])('absorbs a %s outcome', async (_label, rows, expected) => {
    h.execute.mockResolvedValueOnce(rows);
    await expect(requeueDeadLetteredJob(7, NOW)).resolves.toEqual(expected);
  });

  it('maps the unique-index race to superseded', async () => {
    const unique = Object.assign(new Error('duplicate key'), { code: '23505' });
    h.execute.mockRejectedValueOnce(
      Object.assign(new Error('Failed query'), { cause: unique }),
    );
    await expect(requeueDeadLetteredJob(7, NOW)).resolves.toEqual({
      outcome: 'superseded',
    });
  });
});
