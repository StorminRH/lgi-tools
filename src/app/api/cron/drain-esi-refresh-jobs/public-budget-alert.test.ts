import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  hasAlert: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  alert: vi.fn(),
  configured: vi.fn(),
}));

vi.mock('@/data/telemetry/queries', () => ({
  claimPublicEsiBudgetAlert: mocks.claim,
  completePublicEsiBudgetAlertClaim: mocks.complete,
  countPublicEsiBudgetExhaustionsSince: mocks.count,
  hasPublicEsiBudgetAlertSince: mocks.hasAlert,
}));
vi.mock('@/lib/alerts', () => ({
  alertPublicEsiBudgetExhaustion: mocks.alert,
  isOpsAlertConfigured: mocks.configured,
}));

import { maybeAlertPublicEsiBudgetExhaustion } from './public-budget-alert';

describe('maybeAlertPublicEsiBudgetExhaustion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAlert.mockResolvedValue(false);
    mocks.claim.mockResolvedValue(42);
    mocks.complete.mockResolvedValue(undefined);
    mocks.alert.mockResolvedValue(true);
    mocks.configured.mockReturnValue(true);
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
    expect(mocks.claim).toHaveBeenCalledWith({ count: 3, windowMinutes: 15 });
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.alert.mock.invocationCallOrder[0]!,
    );
    expect(mocks.complete).toHaveBeenCalledWith(42);
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

  it('does not claim or post a window when alerts are unconfigured', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.configured.mockReturnValue(false);

    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'unconfigured',
      count: 3,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('does not post when the deduplication marker cannot be stored', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.claim.mockRejectedValue(new Error('database unavailable'));

    await expect(maybeAlertPublicEsiBudgetExhaustion()).rejects.toThrow('database unavailable');
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('leaves a failed delivery as an expiring claim', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.alert.mockRejectedValue(new Error('webhook timed out'));

    await expect(maybeAlertPublicEsiBudgetExhaustion()).rejects.toThrow('webhook timed out');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('leaves an unconfigured delivery as an expiring claim', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.alert.mockResolvedValue(false);

    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'unconfigured',
      count: 3,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
