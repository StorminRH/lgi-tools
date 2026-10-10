import { describe, expect, it, vi } from 'vitest';
import { createReservedConnectionMock } from './__tests__/support/reserved-connection-mock';
import { ADVISORY_LOCKS, withAdvisoryLock } from './advisory-lock';

function makeClient(got: boolean, opts: { unlockThrows?: boolean } = {}) {
  const sqlCalls: string[] = [];
  const { client, reserved, reserve } = createReservedConnectionMock((strings) => {
    const text = strings.join('?');
    sqlCalls.push(text);
    if (text.includes('pg_try_advisory_lock')) return Promise.resolve([{ got }]);
    if (text.includes('pg_advisory_unlock')) {
      if (opts.unlockThrows) return Promise.reject(new Error('unlock failed'));
      return Promise.resolve([{ unlocked: true }]);
    }
    return Promise.resolve([]);
  });
  return { client, sqlCalls, release: reserved.release, reserve };
}

describe('withAdvisoryLock', () => {
  it('reports busy without running the work when the lock is held', async () => {
    const { client, release } = makeClient(false);
    const work = vi.fn();
    const outcome = await withAdvisoryLock(client, 42, work);
    expect(outcome).toEqual({ busy: true });
    expect(work).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('runs the work and returns its result when the lock is acquired', async () => {
    const { client, sqlCalls, release } = makeClient(true);
    const outcome = await withAdvisoryLock(client, 42, async () => 'done');
    expect(outcome).toEqual({ busy: false, result: 'done' });
    expect(sqlCalls.some((q) => q.includes('pg_try_advisory_lock'))).toBe(true);
    expect(sqlCalls.some((q) => q.includes('pg_advisory_unlock'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not attempt the unlock when the lock was never held (busy path)', async () => {
    const { client, sqlCalls } = makeClient(false);
    await withAdvisoryLock(client, 42, async () => 'x');
    expect(sqlCalls.some((q) => q.includes('pg_advisory_unlock'))).toBe(false);
  });

  it('releases the connection even if the work throws', async () => {
    const { client, release } = makeClient(true);
    await expect(
      withAdvisoryLock(client, 42, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('still releases the connection when the unlock query itself throws', async () => {
    const { client, release } = makeClient(true, { unlockThrows: true });
    await expect(withAdvisoryLock(client, 42, async () => 'ok')).rejects.toThrow('unlock failed');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

it('registers each advisory-lock key once, as a safe integer outside the retired and test keys', () => {
  const retiredKeys = [8_273_619_012, 8_273_619_016, 8_419_273_051];
  const concurrencyTestKey = 918_273_645;
  const keys = Object.values(ADVISORY_LOCKS);

  expect(new Set(keys).size).toBe(keys.length);
  for (const key of keys) {
    expect(Number.isSafeInteger(key), `${key} is not a safe integer`).toBe(true);
    expect(retiredKeys, `${key} reuses a retired key`).not.toContain(key);
    expect(key).not.toBe(concurrencyTestKey);
  }
});

it('keeps every advisory-lock key at its deployed value', () => {
  // A changed key lets a run on the old deploy and one on the new deploy hold
  // "the same" lock at once, so each value is pinned to what production uses.
  expect(ADVISORY_LOCKS).toEqual({
    sdeIngest: 8_273_619_013,
    industryIndices: 8_273_619_014,
    gscSync: 8_273_619_015,
    esiRefreshQueue: 8_273_619_017,
    whStaticsRefresh: 8_273_619_018,
    mapPurge: 8_273_619_019,
  });
});
