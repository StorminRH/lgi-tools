import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  availability: vi.fn(),
  budget: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: () => {} }));
vi.mock('@/data/telemetry/queries', () => ({ getEsiAvailability: h.availability }));
vi.mock('@/platform/esi/scoreboard', () => ({ readEsiBudgetSnapshot: h.budget }));

import { getEsiHealth } from './esi-health';

const snapshot = (effectiveRemaining: number) => ({
  effectiveRemaining,
  selfCount: 0,
  echo: null,
  source: 'shared' as const,
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.availability.mockReset();
  h.budget.mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => errorSpy.mockRestore());

describe('getEsiHealth', () => {
  it('rates the last hour against the admin target and reads the live error budget', async () => {
    h.availability.mockResolvedValue({ total: 200, healthy: 180, rate: 0.9 });
    h.budget.mockResolvedValue(snapshot(84));
    const health = await getEsiHealth();
    expect(health).toEqual({
      availability: { state: 'measured', rate: 0.9, level: 'amber' },
      budget: { state: 'live', remaining: 84, ceiling: 100 },
    });
    const [range] = h.availability.mock.calls[0] as [{ from: Date; to: Date }];
    expect(range.to.getTime() - range.from.getTime()).toBe(3_600_000);
  });

  it('reads a spent or missing budget as paused, and an hour without calls as idle', async () => {
    h.availability.mockResolvedValue({ total: 0, healthy: 0, rate: null });
    h.budget.mockResolvedValueOnce(snapshot(12));
    expect(await getEsiHealth()).toEqual({
      availability: { state: 'idle' },
      budget: { state: 'paused', remaining: 12, ceiling: 100 },
    });

    h.budget.mockResolvedValueOnce(null);
    expect((await getEsiHealth()).budget).toEqual({ state: 'paused', remaining: 0, ceiling: 100 });
  });

  it('says unknown for a read that fails, without failing the other', async () => {
    h.availability.mockRejectedValue(new Error('neon: connection terminated'));
    h.budget.mockRejectedValue(new Error('upstash: timeout'));
    expect(await getEsiHealth()).toEqual({
      availability: { state: 'unknown' },
      budget: { state: 'unknown' },
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
