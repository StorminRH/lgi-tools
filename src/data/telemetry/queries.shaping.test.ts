import { beforeEach, describe, expect, it, vi } from 'vitest';

let cannedQueries: unknown[][] = [];

function queryFor(rows: unknown[]) {
  const result = Promise.resolve(rows);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    innerJoin: vi.fn(),
    then: result.then.bind(result),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.groupBy.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  return query;
}

vi.mock('@/db', () => ({
  db: {
    select: () => queryFor(cannedQueries.shift() ?? []),
  },
}));

import { getFallbackRate } from './queries';

const RANGE = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-07-08T00:00:00Z'),
};

beforeEach(() => {
  cannedQueries = [];
});

describe('telemetry query result shaping', () => {
  it('normalizes fallback totals and daily rows to numbers', async () => {
    cannedQueries = [
      [{ esi: '100', fallback: '5' }],
      [{ day: '2026-07-02', esi: '20', fallback: '2' }],
    ];

    await expect(getFallbackRate(RANGE)).resolves.toEqual({
      esi: 100,
      fallback: 5,
      perDay: [{ day: '2026-07-02', esi: 20, fallback: 2 }],
    });
  });

  it('returns zero fallback totals for an empty result', async () => {
    cannedQueries = [[], []];

    await expect(getFallbackRate(RANGE)).resolves.toEqual({
      esi: 0,
      fallback: 0,
      perDay: [],
    });
  });
});
