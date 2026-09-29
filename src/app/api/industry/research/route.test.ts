import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedFailure } from '@/lib/failure';

const getLiveHistoryMock = vi.fn();
const getResearchEconomicsMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/data/market-history/refresh-on-view', () => ({
  getLiveHistory: (...args: unknown[]) => getLiveHistoryMock(...args),
}));
vi.mock('@/features/industry-planner/queries', () => ({
  getResearchEconomics: (...args: unknown[]) => getResearchEconomicsMock(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { maxDuration, POST } from './route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/industry/research', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const economics = {
  blueprintTypeId: 691,
  productTypeId: 587,
  activityId: 1,
  quantityPerRun: 1,
  jobSeconds: 6000,
  inputCost: 390_000,
  jobFee: 14_000,
  incomplete: false,
  drivers: [{ typeId: 34, name: 'Tritanium', share: 0.46 }],
};

const inputs = {
  typeId: 587,
  averageDailyVolume: [{ days: 30, adv: 400 }],
  volumeCv: 0.3,
  priceVolatility: 0.02,
  daysCovered: 30,
  latestDate: '2026-09-28',
};

function row(date: string) {
  return { date, average: 500_000, highest: 510_000, lowest: 490_000, volume: 400n, orderCount: 300 };
}

describe('POST /api/industry/research', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ ok: true });
    getResearchEconomicsMock.mockImplementation(async (id: number) => (id === 691 ? economics : null));
    getLiveHistoryMock.mockResolvedValue({
      inputs: new Map([[587, inputs]]),
      rows: new Map([[587, [row('2026-09-28'), row('2026-09-26'), row('2026-09-27')]]]),
      degraded: { fetched: 0, budgetExhausted: false },
      metrics: { requested: 1, freshEsi: 0, warmStored: 1, staleStored: 0, missing: 0 },
    });
  });

  it('returns economics, history inputs and the latest days of the series', async () => {
    const response = await POST(request({ blueprintTypeIds: [691, 691, 999], seriesDays: 2 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(getLiveHistoryMock).toHaveBeenCalledWith([587]);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ blueprintTypeId: 691, economics, history: inputs });
    expect(body.items[0].series.map((d: { date: string }) => d.date)).toEqual(['2026-09-27', '2026-09-28']);
    expect(body.items[0].series[0].volume).toBe(400);
    expect(body.items[1]).toEqual({ blueprintTypeId: 999, economics: null, history: null, series: [] });
  });

  it('bounds the handler well under the platform default', () => {
    expect(maxDuration).toBe(60);
  });

  it('rejects a body without ids and rate-limits by its own bucket', async () => {
    expect((await POST(request({ blueprintTypeIds: [], seriesDays: 30 }))).status).toBe(400);
    checkRateLimitMock.mockResolvedValue({ ok: false, failure: rateLimitedFailure(30) });
    const limited = await POST(request({ blueprintTypeIds: [691], seriesDays: 30 }));
    expect(limited.status).toBe(429);
    expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ name: 'industry-research' }));
  });
});
