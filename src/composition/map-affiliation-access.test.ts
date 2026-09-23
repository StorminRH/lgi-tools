import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPendingMapAccessChanges: vi.fn(),
  acknowledgeMapAccessChanges: vi.fn(),
  projectMapAccess: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  MAX_PENDING_BATCH: 100,
  readPendingMapAccessChanges: mocks.readPendingMapAccessChanges,
  acknowledgeMapAccessChanges: mocks.acknowledgeMapAccessChanges,
}));
vi.mock('@/platform/auth/affiliation', () => ({ refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome }));
vi.mock('./map-access-projection', () => ({
  projectMapAccess: mocks.projectMapAccess,
  requireCurrentProjection: (result: { outcome: string }) => {
    if (result.outcome === 'stale') throw new Error('newer projection won');
    return result;
  },
}));

import {
  deliverCapturedMapAccessChanges,
  reconcileAffiliationAccess,
  refreshAffiliationsAndReconcile,
} from './map-affiliation-access';

const pending = [{ mapId: 'first-map', version: 'first' }, { mapId: 'second-map', version: 'second' }];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readPendingMapAccessChanges.mockResolvedValue(pending);
  mocks.projectMapAccess.mockResolvedValue({ outcome: 'applied' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('does one pending read and no other work on an empty queue', async () => {
  mocks.readPendingMapAccessChanges.mockResolvedValue([]);
  expect(await reconcileAffiliationAccess()).toEqual({ processed: 0, failed: 0 });
  expect(mocks.projectMapAccess).not.toHaveBeenCalled();
  expect(mocks.acknowledgeMapAccessChanges).not.toHaveBeenCalled();
});

it('delivers captured generations without a queue read and leaves overflow for another run', async () => {
  const captured = Array.from({ length: 101 }, (_, i) => ({ mapId: `map-${i}`, version: `v-${i}` }));
  expect(await deliverCapturedMapAccessChanges(captured)).toEqual({ processed: 100, failed: 0 });
  expect(mocks.readPendingMapAccessChanges).not.toHaveBeenCalled();
  expect(mocks.projectMapAccess).toHaveBeenCalledTimes(100);
  expect(mocks.projectMapAccess).not.toHaveBeenCalledWith('map-100', expect.anything());
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(captured.slice(0, 100), []);
});

it('projects each pending map once and acknowledges captured generations after delivery', async () => {
  expect(await reconcileAffiliationAccess()).toEqual({ processed: 2, failed: 0 });
  expect(mocks.projectMapAccess).toHaveBeenCalledTimes(2);
  expect(mocks.projectMapAccess).toHaveBeenCalledWith('first-map', { timeoutMs: 4_000 });
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(pending, []);
  expect(mocks.projectMapAccess.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.acknowledgeMapAccessChanges.mock.invocationCallOrder[0]!,
  );
});

it.each(['throw', 'stale'])('retains failed work (%s) while completing independent maps', async (failure) => {
  mocks.projectMapAccess.mockImplementation(async (mapId: string) => {
    if (mapId === 'first-map') {
      if (failure === 'throw') throw new Error('Convex unavailable');
      return { outcome: 'stale' };
    }
    return { outcome: 'applied' };
  });
  expect(await reconcileAffiliationAccess()).toEqual({ processed: 1, failed: 1 });
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith([pending[1]], [pending[0]]);
});

it('retries failed delivery without requiring another affiliation change', async () => {
  mocks.readPendingMapAccessChanges.mockResolvedValue([pending[0]]);
  mocks.projectMapAccess.mockRejectedValueOnce(new Error('delivery failed'));
  expect(await reconcileAffiliationAccess()).toEqual({ processed: 0, failed: 1 });
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenLastCalledWith([], [pending[0]]);
  expect(await reconcileAffiliationAccess()).toEqual({ processed: 1, failed: 0 });
  expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
});

it('bounds concurrent attempts, stops within the run budget, and saves completed progress', async () => {
  vi.useFakeTimers();
  const batch = Array.from({ length: 24 }, (_, i) => ({ mapId: `map-${i}`, version: `v-${i}` }));
  mocks.readPendingMapAccessChanges.mockResolvedValue(batch);
  let active = 0;
  let peak = 0;
  mocks.projectMapAccess.mockImplementation(async (_mapId: string, { timeoutMs }: { timeoutMs: number }) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    active--;
    return { outcome: 'applied' };
  });
  const run = reconcileAffiliationAccess();
  await vi.advanceTimersByTimeAsync(20_000);
  expect(await run).toEqual({ processed: 20, failed: 4 });
  expect(peak).toBe(4);
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(batch.slice(0, 20), batch.slice(20));
  expect(mocks.projectMapAccess.mock.calls.at(-1)?.[1]).toEqual({ timeoutMs: 3_000 });
});

it('skips queue I/O for unchanged refreshes and delivers newly queued changes', async () => {
  mocks.refreshAffiliationsWithOutcome.mockResolvedValueOnce({ accessChanged: false });
  await refreshAffiliationsAndReconcile([1]);
  expect(mocks.readPendingMapAccessChanges).not.toHaveBeenCalled();
  mocks.refreshAffiliationsWithOutcome.mockResolvedValueOnce({ accessChanged: true });
  await refreshAffiliationsAndReconcile([1]);
  expect(mocks.readPendingMapAccessChanges).toHaveBeenCalledOnce();
});
