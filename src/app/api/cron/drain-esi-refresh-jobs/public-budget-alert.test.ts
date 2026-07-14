import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  hasAlert: vi.fn(),
  log: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@/data/telemetry/queries', () => ({
  countPublicEsiBudgetExhaustionsSince: mocks.count,
  hasPublicEsiBudgetAlertSince: mocks.hasAlert,
  logUsageEvent: mocks.log,
}));
vi.mock('@/lib/alerts', () => ({ alertPublicEsiBudgetExhaustion: mocks.alert }));

import { maybeAlertPublicEsiBudgetExhaustion } from './public-budget-alert';

describe('maybeAlertPublicEsiBudgetExhaustion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAlert.mockResolvedValue(false);
    mocks.log.mockResolvedValue(undefined);
    mocks.alert.mockResolvedValue(true);
  });

  it('does not alert below three public exhaustion events', async () => {
    mocks.count.mockResolvedValue(2);
    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'below-threshold',
      count: 2,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('alerts once at the threshold and records the aggregation marker', async () => {
    mocks.count.mockResolvedValue(3);
    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'alerted',
      count: 3,
    });
    expect(mocks.alert).toHaveBeenCalledWith({ count: 3, windowMinutes: 15 });
    expect(mocks.log).toHaveBeenCalledWith({
      action: 'public_esi_budget_alerted',
      metadata: { count: 3, windowMinutes: 15 },
    });
  });

  it('suppresses another alert inside the same window', async () => {
    mocks.count.mockResolvedValue(5);
    mocks.hasAlert.mockResolvedValue(true);
    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'already-alerted',
      count: 5,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
