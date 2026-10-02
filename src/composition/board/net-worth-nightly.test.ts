import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listUserIds: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/platform/auth/linked-characters', () => ({ listUserIdsWithLinkedCharacters: mocks.listUserIds }));
vi.mock('./board-view', () => ({ recordNetWorthSnapshot: mocks.record }));

import { revalueAllNetWorth } from './net-worth-nightly';

const NOW = new Date('2026-10-02T12:10:00Z');

describe('revalueAllNetWorth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.listUserIds.mockReset().mockResolvedValue(['a', 'b', 'c']);
    mocks.record.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records every linked account for the same day', async () => {
    await expect(revalueAllNetWorth(NOW.getTime() + 60_000, NOW)).resolves.toEqual({
      accounts: 3, revalued: 3, failed: 0, deferred: 0,
    });
    expect(mocks.record.mock.calls).toEqual([['a', NOW], ['b', NOW], ['c', NOW]]);
  });

  it('counts a failed account and carries on with the rest', async () => {
    mocks.record.mockRejectedValueOnce(new Error('boom'));
    await expect(revalueAllNetWorth(NOW.getTime() + 60_000, NOW)).resolves.toEqual({
      accounts: 3, revalued: 2, failed: 1, deferred: 0,
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('starts no account past the deadline and reports the rest deferred', async () => {
    mocks.record.mockImplementation(async () => {
      vi.advanceTimersByTime(40_000);
    });
    await expect(revalueAllNetWorth(NOW.getTime() + 60_000, NOW)).resolves.toEqual({
      accounts: 3, revalued: 2, failed: 0, deferred: 1,
    });
  });
});
