import { expect, test, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import type { OwnerSyncResult, OwnerSyncRunOptions } from '@/platform/owner-sync';

const mocks = vi.hoisted(() => ({
  enqueueEsiRefreshJob: vi.fn(async (_input: unknown) => 1),
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  enqueueEsiRefreshJob: mocks.enqueueEsiRefreshJob,
}));

import { ownerSyncDataset } from './esi-refresh-owner-sync';

const pilot = { ownerType: 'character' as const, ownerId: 7 };
const sameIdCorp = { ownerType: 'corporation' as const, ownerId: 7 };
const otherPilot = { ownerType: 'character' as const, ownerId: 8 };
const budget = new EsiBudgetExhaustedError(12, 'rate_limited', 900, '/characters/7/assets/');

type Refresh = (port: object, userId: string, options?: OwnerSyncRunOptions) => Promise<OwnerSyncResult[]>;

test('an on-view run queues each budget-deferred owner under its dataset, on a fresh port per run', async () => {
  mocks.enqueueEsiRefreshJob.mockClear();
  const refresh = vi.fn<Refresh>(async (_port, _userId, options) => {
    await options?.onBudgetDeferred?.(pilot, budget);
    return [{ kind: 'deferred_for_budget', target: pilot, error: budget }];
  });
  const dataset = ownerSyncDataset('owned_assets', () => ({}), refresh);

  await expect(dataset.onView('user-1')).resolves.toEqual([
    { kind: 'deferred_for_budget', target: pilot, error: budget },
  ]);
  await dataset.onView('user-2');

  expect(mocks.enqueueEsiRefreshJob.mock.calls).toEqual([
    [{ dataset: 'owned_assets', userId: 'user-1', target: pilot, error: budget }],
    [{ dataset: 'owned_assets', userId: 'user-2', target: pilot, error: budget }],
  ]);
  const [firstPort, secondPort] = refresh.mock.calls.map(([port]) => port);
  expect(firstPort).not.toBe(secondPort);
  expect(refresh.mock.calls.map(([, , options]) => options?.target)).toEqual([undefined, undefined]);
});

test('a job refreshes its target alone and settles on that target\'s strongest open outcome', async () => {
  mocks.enqueueEsiRefreshJob.mockClear();
  const port = {};
  const refresh = vi.fn<Refresh>();
  const { runJob } = ownerSyncDataset('character_sheet', () => port, refresh);

  refresh.mockResolvedValueOnce([
    { kind: 'succeeded', target: pilot },
    { kind: 'failed_permanent', target: pilot, code: 'contract_error' },
    { kind: 'deferred_for_budget', target: sameIdCorp, error: budget },
    { kind: 'failed_retryable', target: pilot, code: 'esi_server_error' },
  ]);
  await expect(runJob('user-1', pilot)).resolves.toEqual({
    kind: 'failed_retryable', target: pilot, code: 'esi_server_error',
  });
  expect(refresh).toHaveBeenCalledExactlyOnceWith(port, 'user-1', { target: pilot });

  refresh.mockResolvedValueOnce([
    { kind: 'failed_retryable', target: pilot, code: 'esi_server_error' },
    { kind: 'deferred_for_budget', target: pilot, error: budget },
  ]);
  await expect(runJob('user-1', pilot)).resolves.toEqual({
    kind: 'deferred_for_budget', target: pilot, error: budget,
  });

  refresh.mockResolvedValueOnce([
    { kind: 'failed_permanent', target: otherPilot, code: 'contract_error' },
    { kind: 'succeeded', target: pilot },
  ]);
  await expect(runJob('user-1', pilot)).resolves.toEqual({ kind: 'succeeded', target: pilot });
  expect(mocks.enqueueEsiRefreshJob).not.toHaveBeenCalled();
});

test('a job whose target no longer syncs fails permanently as owner_unavailable', async () => {
  const refresh = vi.fn<Refresh>();
  const { runJob } = ownerSyncDataset('skills', () => ({}), refresh);
  const unavailable = { kind: 'failed_permanent', target: pilot, code: 'owner_unavailable' };

  refresh.mockResolvedValueOnce([]);
  await expect(runJob('user-1', pilot)).resolves.toEqual(unavailable);

  refresh.mockResolvedValueOnce([{ kind: 'deferred_for_budget', target: sameIdCorp, error: budget }]);
  await expect(runJob('user-1', pilot)).resolves.toEqual(unavailable);
});
