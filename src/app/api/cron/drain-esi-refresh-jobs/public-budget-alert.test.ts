import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  hasAlert: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  alert: vi.fn(),
  configured: vi.fn(),
  emitDomainEvent: vi.fn(),
  recentExhaustion: vi.fn(),
}));

vi.mock('@/data/domain-events/queries', () => ({
  emitDomainEvent: mocks.emitDomainEvent,
}));

vi.mock('@/data/telemetry/queries', () => ({
  claimPublicEsiBudgetAlert: mocks.claim,
  completePublicEsiBudgetAlertClaim: mocks.complete,
  countPublicEsiBudgetExhaustionsInWindow: mocks.count,
  hasPublicEsiBudgetAlertForWindow: mocks.hasAlert,
}));
vi.mock('@/lib/alerts', () => ({
  alertPublicEsiBudgetExhaustion: mocks.alert,
  isOpsAlertConfigured: mocks.configured,
}));
vi.mock('@/platform/esi/exhaustion-marker', () => ({
  hasRecentBudgetExhaustion: mocks.recentExhaustion,
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
    mocks.recentExhaustion.mockResolvedValue(true);
  });

  it('skips every Neon read when no recent exhaustion marker exists', async () => {
    mocks.recentExhaustion.mockResolvedValue(false);

    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'no-recent-exhaustion',
    });
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.hasAlert).not.toHaveBeenCalled();
  });

  it('does not alert below three public exhaustion events', async () => {
    mocks.count.mockResolvedValue(2);
    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'below-threshold',
      count: 2,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('preserves the Neon-backed path when marker state is unknown', async () => {
    mocks.recentExhaustion.mockResolvedValue('unknown');
    mocks.count.mockResolvedValue(0);

    await expect(maybeAlertPublicEsiBudgetExhaustion()).resolves.toEqual({
      status: 'below-threshold',
      count: 0,
    });
    expect(mocks.count).toHaveBeenCalledOnce();
  });

  it('alerts once at the threshold and records the aggregation marker', async () => {
    mocks.count.mockResolvedValue(3);
    const now = new Date('2026-07-14T13:17:00.000Z');
    await expect(maybeAlertPublicEsiBudgetExhaustion(now)).resolves.toEqual({
      status: 'alerted',
      count: 3,
    });
    expect(mocks.count).toHaveBeenCalledWith(
      new Date('2026-07-14T13:00:00.000Z'),
      new Date('2026-07-14T13:15:00.000Z'),
    );
    expect(mocks.alert).toHaveBeenCalledWith({ count: 3, windowMinutes: 15 });
    expect(mocks.hasAlert).toHaveBeenCalledWith('2026-07-14T13:00:00.000Z');
    expect(mocks.claim).toHaveBeenCalledWith({
      count: 3,
      windowMinutes: 15,
      windowStartedAt: '2026-07-14T13:00:00.000Z',
      windowEndedAt: '2026-07-14T13:15:00.000Z',
    });
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.alert.mock.invocationCallOrder[0]!,
    );
    expect(mocks.complete).toHaveBeenCalledWith(42);
    expect(mocks.emitDomainEvent).toHaveBeenCalledWith({
      eventType: 'esi_budget_guard_exhausted',
      metadata: {
        count: 3,
        windowMinutes: 15,
        windowStartedAt: '2026-07-14T13:00:00.000Z',
        windowEndedAt: '2026-07-14T13:15:00.000Z',
      },
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
    expect(mocks.emitDomainEvent).not.toHaveBeenCalled();
  });

  it('does not let a prior pending claim suppress the next completed window', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.hasAlert.mockImplementation((windowStartedAt: string) =>
      Promise.resolve(windowStartedAt === '2026-07-14T13:00:00.000Z'),
    );

    await expect(
      maybeAlertPublicEsiBudgetExhaustion(new Date('2026-07-14T13:31:00.000Z')),
    ).resolves.toEqual({ status: 'alerted', count: 3 });
    expect(mocks.hasAlert).toHaveBeenCalledWith('2026-07-14T13:15:00.000Z');
    expect(mocks.alert).toHaveBeenCalledOnce();
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
    expect(mocks.emitDomainEvent).not.toHaveBeenCalled();
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
    expect(mocks.emitDomainEvent).not.toHaveBeenCalled();
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
