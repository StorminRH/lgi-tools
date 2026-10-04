import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  refresh: vi.fn(),
  record: vi.fn(),
  order: [] as string[],
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./board-view', () => ({
  refreshBoardDatasets: mocks.refresh,
  recordNetWorthSnapshot: mocks.record,
}));

import { revalueAfterRosterChange } from './net-worth-link';

describe('revalueAfterRosterChange', () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.after.mockReset();
    mocks.refresh.mockReset().mockImplementation(async (userId: string) => { mocks.order.push(`refresh:${userId}`); });
    mocks.record.mockReset().mockImplementation(async (userId: string) => { mocks.order.push(`record:${userId}`); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('syncs the roster and then records the day after the response', async () => {
    await revalueAfterRosterChange('u1');
    expect(mocks.order).toEqual([]);
    const task = mocks.after.mock.lastCall?.[0] as () => Promise<void>;
    await task();
    expect(mocks.order).toEqual(['refresh:u1', 'record:u1']);
  });

  it('runs inline outside a request scope', async () => {
    mocks.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    await revalueAfterRosterChange('u2');
    expect(mocks.order).toEqual(['refresh:u2', 'record:u2']);
  });

  it('never throws when the revalue fails', async () => {
    mocks.after.mockImplementation(() => {
      throw new Error('no scope');
    });
    mocks.record.mockRejectedValue(new Error('db down'));
    await expect(revalueAfterRosterChange('u3')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
