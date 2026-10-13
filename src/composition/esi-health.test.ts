import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  availability: vi.fn(),
  budget: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: () => {} }));
vi.mock('@/platform/esi/scoreboard', () => ({
  readEsiAvailabilitySnapshot: h.availability,
  readEsiBudgetSnapshot: h.budget,
}));

import { getEsiHealth } from './esi-health';

const snapshot = (effectiveRemaining: number) => ({
  effectiveRemaining,
  selfCount: 0,
  echo: null,
  source: 'shared' as const,
});

const calls = (calls: number, failures: number) => ({ calls, failures, source: 'shared' as const });

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.availability.mockReset();
  h.budget.mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => errorSpy.mockRestore());

describe('getEsiHealth', () => {
  it('rates the last hour of gate calls against the admin target and reads the live error budget', async () => {
    h.availability.mockResolvedValue(calls(200, 20));
    h.budget.mockResolvedValue(snapshot(84));
    expect(await getEsiHealth()).toEqual({
      availability: { state: 'measured', rate: 0.9, level: 'amber' },
      budget: { state: 'live', remaining: 84, ceiling: 100 },
    });
  });

  it('reads a spent or missing budget as paused, and an hour without calls as idle', async () => {
    h.availability.mockResolvedValue(calls(0, 0));
    h.budget.mockResolvedValueOnce(snapshot(12));
    expect(await getEsiHealth()).toEqual({
      availability: { state: 'idle' },
      budget: { state: 'paused', remaining: 12, ceiling: 100 },
    });

    h.budget.mockResolvedValueOnce(null);
    expect((await getEsiHealth()).budget).toEqual({ state: 'paused', remaining: 0, ceiling: 100 });
  });

  it('says unknown without a scoreboard, or for a read that fails, without failing the other', async () => {
    h.availability.mockResolvedValueOnce(null);
    h.budget.mockResolvedValueOnce(snapshot(100));
    expect((await getEsiHealth()).availability).toEqual({ state: 'unknown' });

    h.availability.mockRejectedValueOnce(new Error('upstash: timeout'));
    h.budget.mockRejectedValueOnce(new Error('upstash: timeout'));
    expect(await getEsiHealth()).toEqual({
      availability: { state: 'unknown' },
      budget: { state: 'unknown' },
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
