import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const done = { deleted: 0, finished: true };
  return {
    order: [] as string[],
    prune: (name: string) =>
      vi.fn(async () => {
        h.order.push(name);
        return done;
      }),
    retryRequestedDeletions: vi.fn(),
    reconcileTrackingMerges: vi.fn(),
    scopeLegacyMaps: vi.fn(),
    pruneTrackingMergeReceipts: vi.fn(),
  };
});

const prunes = vi.hoisted(() => ({
  pruneDomainEvents: h.prune('domain_events'),
  pruneUsageLogs: h.prune('usage_logs'),
  pruneGscSearchAnalytics: h.prune('gsc_search_analytics'),
  pruneGscUrlInspections: h.prune('gsc_url_inspection'),
  pruneCorpAccessAudit: h.prune('corp_access_audit'),
  pruneExpiredVerifications: h.prune('verification'),
  pruneExpiredSessions: h.prune('session'),
  pruneEsiSnapshots: h.prune('esi_snapshots'),
  pruneEsiRefreshJobs: h.prune('esi_refresh_jobs'),
  pruneWhStaticsSnapshots: h.prune('wh_statics_snapshots'),
  pruneStaleMarketHistory: h.prune('market_history'),
}));

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/data/domain-events/queries', () => ({ pruneDomainEvents: prunes.pruneDomainEvents }));
vi.mock('@/data/telemetry/queries', () => ({ pruneUsageLogs: prunes.pruneUsageLogs }));
vi.mock('@/data/gsc/queries', () => ({
  pruneGscSearchAnalytics: prunes.pruneGscSearchAnalytics,
  pruneGscUrlInspections: prunes.pruneGscUrlInspections,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({ pruneCorpAccessAudit: prunes.pruneCorpAccessAudit }));
vi.mock('@/platform/auth/verification-retention', () => ({
  pruneExpiredVerifications: prunes.pruneExpiredVerifications,
  pruneExpiredSessions: prunes.pruneExpiredSessions,
}));
vi.mock('./esi-snapshot-retention', () => ({ pruneEsiSnapshots: prunes.pruneEsiSnapshots }));
vi.mock('@/data/esi-refresh-jobs/queries', () => ({ pruneEsiRefreshJobs: prunes.pruneEsiRefreshJobs }));
vi.mock('@/data/wh-statics/queries', () => ({ pruneWhStaticsSnapshots: prunes.pruneWhStaticsSnapshots }));
vi.mock('@/data/market-history/ingest', () => ({ pruneStaleMarketHistory: prunes.pruneStaleMarketHistory }));
vi.mock('@/composition/account-lifecycle/account-purge', () => ({
  retryRequestedDeletions: h.retryRequestedDeletions,
}));
vi.mock('@/composition/account-lifecycle/tracking-merge-retry', () => ({
  reconcileTrackingMerges: h.reconcileTrackingMerges,
}));
vi.mock('@/composition/map-character-scoping', () => ({
  scopeLegacyMaps: h.scopeLegacyMaps,
}));
vi.mock('@/composition/account-lifecycle/tracking-receipt-retention', () => ({
  pruneTrackingMergeReceipts: h.pruneTrackingMergeReceipts,
}));

import { runHousekeeping } from './housekeeping';

const NOW = new Date('2026-07-14T12:00:00Z');

beforeEach(() => {
  h.order.length = 0;
  h.retryRequestedDeletions.mockReset().mockResolvedValue({ retried: 0, failed: 0 });
  h.reconcileTrackingMerges.mockReset().mockResolvedValue({ processed: 0, failed: 0 });
  h.scopeLegacyMaps.mockReset().mockResolvedValue({ succeeded: 0, failed: 0 });
  h.pruneTrackingMergeReceipts.mockReset().mockImplementation(async () => {
    h.order.push('account_merge_tracking_receipts');
    return { deleted: 0, finished: true };
  });
});

describe('runHousekeeping', () => {
  it('runs every delete then both retries and reports a clean run', async () => {
    prunes.pruneExpiredSessions.mockImplementationOnce(async () => {
      h.order.push('session');
      return { deleted: 4, finished: true };
    });
    h.retryRequestedDeletions.mockResolvedValueOnce({ retried: 1, failed: 0 });

    const summary = await runHousekeeping(NOW);

    expect(h.order).toEqual([
      'domain_events',
      'usage_logs',
      'gsc_search_analytics',
      'gsc_url_inspection',
      'corp_access_audit',
      'verification',
      'session',
      'esi_snapshots',
      'esi_refresh_jobs',
      'wh_statics_snapshots',
      'market_history',
      'account_merge_tracking_receipts',
    ]);
    expect(summary.status).toBe('cleaned');
    expect(summary.deletes).toContainEqual({ task: 'session', deleted: 4, finished: true, error: null });
    expect(summary.retries).toEqual([
      { task: 'requested_deletions', succeeded: 1, failed: 0, error: null },
      { task: 'tracking_merges', succeeded: 0, failed: 0, error: null },
      { task: 'character_scoping', succeeded: 0, failed: 0, error: null },
    ]);
  });

  it('runs one bounded legacy-map scoping batch and marks a kept map partial', async () => {
    h.scopeLegacyMaps.mockResolvedValueOnce({ succeeded: 2, failed: 1 });
    const summary = await runHousekeeping(NOW);
    expect(h.scopeLegacyMaps).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
    expect(summary.retries).toContainEqual({
      task: 'character_scoping', succeeded: 2, failed: 1, error: null,
    });
    expect(summary.status).toBe('partial');
  });

  it('cleans merge receipts after tracking retries and records failures through housekeeping', async () => {
    h.reconcileTrackingMerges.mockImplementationOnce(async () => {
      h.order.push('tracking_merges');
      return { processed: 1, failed: 0 };
    });
    h.pruneTrackingMergeReceipts.mockImplementationOnce(async () => {
      h.order.push('account_merge_tracking_receipts');
      return { deleted: 2, finished: false };
    });
    const summary = await runHousekeeping(NOW);
    expect(h.order.slice(-2)).toEqual(['tracking_merges', 'account_merge_tracking_receipts']);
    expect(summary.deletes).toContainEqual({
      task: 'account_merge_tracking_receipts', deleted: 2, finished: false, error: null,
    });
    expect(summary.status).toBe('cleaned');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.pruneTrackingMergeReceipts.mockRejectedValueOnce(new Error('pending lookup unavailable'));
    await expect(runHousekeeping(NOW)).resolves.toMatchObject({ status: 'partial' });
    errorSpy.mockRestore();
  });

  it('keeps going past a failed delete and marks the run partial', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prunes.pruneUsageLogs.mockRejectedValueOnce(new Error('usage_logs locked'));

    const summary = await runHousekeeping(NOW);

    expect(summary.status).toBe('partial');
    expect(summary.deletes).toContainEqual({
      task: 'usage_logs',
      deleted: 0,
      finished: false,
      error: 'usage_logs locked',
    });
    expect(h.order).toContain('market_history');
    expect(h.reconcileTrackingMerges).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it('treats an unfinished delete as backlog, not failure', async () => {
    prunes.pruneEsiSnapshots.mockResolvedValueOnce({ deleted: 5000, finished: false });
    await expect(runHousekeeping(NOW)).resolves.toMatchObject({ status: 'cleaned' });
  });

  it('marks the run partial when a retry fails or throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.retryRequestedDeletions.mockResolvedValueOnce({ retried: 0, failed: 1 });
    await expect(runHousekeeping(NOW)).resolves.toMatchObject({ status: 'partial' });

    h.reconcileTrackingMerges.mockRejectedValueOnce(new Error('direct endpoint unavailable'));
    const summary = await runHousekeeping(NOW);
    expect(summary.status).toBe('partial');
    expect(summary.retries[1]).toEqual({
      task: 'tracking_merges',
      succeeded: 0,
      failed: 0,
      error: 'direct endpoint unavailable',
    });
    errorSpy.mockRestore();
  });
});
